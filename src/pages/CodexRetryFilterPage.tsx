import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { codexRetryFilterApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import {
  IconAlertTriangle,
  IconCheck,
  IconLoader2,
  IconPlus,
  IconRefreshCw,
  IconTrash2,
} from '@/components/ui/icons';
import type {
  CodexRetryFilterAction,
  CodexRetryFilterBreakdown,
  CodexRetryFilterConfig,
  CodexRetryFilterHit,
  CodexRetryFilterStats,
} from '@/types/codexRetryFilter';
import styles from './CodexRetryFilterPage.module.scss';

const DEFAULT_CONFIG: CodexRetryFilterConfig = {
  enabled: false,
  models: ['gpt-*'],
  reasoningTokenLengths: [516, 1034, 1552],
  interceptStreaming: true,
  interceptNonStreaming: true,
  guardRetryAttempts: 3,
};

const PAGE_SIZE = 50;

function formatPercentage(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : '-';
}

function formatTime(value: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function normalizeModelPatterns(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((value) => {
    const text = value.trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  });
  return out;
}

function normalizeReasoningLengths(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  values.forEach((value) => {
    const next = Math.trunc(value);
    if (!Number.isFinite(next) || next <= 0 || seen.has(next)) return;
    seen.add(next);
    out.push(next);
  });
  return out;
}

function ListEditor({
  label,
  values,
  placeholder,
  inputType = 'text',
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  inputType?: 'text' | 'number';
  onChange: (values: string[]) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const addValue = useCallback(() => {
    const parts = draft
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!parts.length) return;
    onChange([...values, ...parts]);
    setDraft('');
  }, [draft, onChange, values]);

  return (
    <div className={styles.listEditor}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.chipList}>
        {values.map((value, index) => (
          <span className={styles.chip} key={`${value}-${index}`}>
            <span>{value}</span>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => onChange(values.filter((_, idx) => idx !== index))}
              aria-label={t('codex_retry_filter.remove_item', { value })}
              title={t('codex_retry_filter.remove_item', { value })}
            >
              <IconTrash2 size={13} />
            </button>
          </span>
        ))}
      </div>
      <div className={styles.inlineInputGroup}>
        <input
          className={styles.textInput}
          type={inputType}
          value={draft}
          placeholder={placeholder}
          min={inputType === 'number' ? 1 : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addValue();
            }
          }}
        />
        <button type="button" className={styles.secondaryButton} onClick={addValue}>
          <IconPlus size={14} />
          {t('common.add')}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.toggleRow}>
      <span className={styles.toggleText}>
        <span className={styles.toggleLabel}>{label}</span>
        {description ? <span className={styles.toggleDesc}>{description}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.switchTrack} aria-hidden="true" />
    </label>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={styles.metricCard}>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
      {hint ? <span className={styles.metricHint}>{hint}</span> : null}
    </div>
  );
}

function actionLabel(t: (key: string, options?: Record<string, string>) => string, action: CodexRetryFilterAction) {
  return t(`codex_retry_filter.actions.${action}`, { defaultValue: action || '-' });
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: CodexRetryFilterBreakdown[];
}) {
  const { t } = useTranslation();
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>{title}</h2>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.compactTable}>
          <thead>
            <tr>
              <th>{t('codex_retry_filter.table.key')}</th>
              <th>{t('codex_retry_filter.metrics.attempts')}</th>
              <th>{t('codex_retry_filter.metrics.hits')}</th>
              <th>{t('codex_retry_filter.metrics.hit_rate')}</th>
              <th>{t('codex_retry_filter.metrics.retry_success_rate')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.key || '-'}>
                <td>{row.label || row.key || '-'}</td>
                <td>{formatNumber(row.attempts)}</td>
                <td>{formatNumber(row.hits)}</td>
                <td>{formatPercentage(row.hitRate)}</td>
                <td>{formatPercentage(row.retrySuccessRate)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className={styles.emptyCell}>{t('codex_retry_filter.no_data')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentHitsTable({ hits }: { hits: CodexRetryFilterHit[] }) {
  const { t } = useTranslation();
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>{t('codex_retry_filter.recent_hits')}</h2>
      </div>
      <div className={styles.tableWrap}>
        <table className={`${styles.compactTable} ${styles.hitsTable}`}>
          <thead>
            <tr>
              <th>{t('codex_retry_filter.table.time')}</th>
              <th>{t('codex_retry_filter.table.model')}</th>
              <th>{t('codex_retry_filter.table.client_model')}</th>
              <th>{t('codex_retry_filter.table.auth')}</th>
              <th>{t('codex_retry_filter.table.stream')}</th>
              <th>{t('codex_retry_filter.table.reasoning_tokens')}</th>
              <th>{t('codex_retry_filter.table.action')}</th>
              <th>{t('codex_retry_filter.table.remaining')}</th>
              <th>{t('codex_retry_filter.table.attempt')}</th>
              <th>{t('codex_retry_filter.table.final_success')}</th>
            </tr>
          </thead>
          <tbody>
            {hits.length ? hits.map((hit) => (
              <tr key={hit.id}>
                <td>{formatTime(hit.occurredAt)}</td>
                <td className={styles.monoCell}>{hit.model || '-'}</td>
                <td className={styles.monoCell}>{hit.clientModel || '-'}</td>
                <td>{hit.authLabel || hit.authId || '-'}</td>
                <td>
                  <span className={hit.stream ? styles.badgeInfo : styles.badgeMuted}>
                    {hit.stream ? t('common.yes') : t('common.no')}
                  </span>
                </td>
                <td>{formatNumber(hit.reasoningTokens)}</td>
                <td>{actionLabel(t, hit.action)}</td>
                <td>{formatNumber(hit.guardRetryRemaining)}</td>
                <td>{formatNumber(hit.attempt)}</td>
                <td>
                  <span className={hit.finalSuccess ? styles.badgeSuccess : styles.badgeMuted}>
                    {hit.finalSuccess ? t('common.yes') : t('common.no')}
                  </span>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={10} className={styles.emptyCell}>{t('codex_retry_filter.no_hits')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CodexRetryFilterPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const connected = connectionStatus === 'connected';
  const [config, setConfig] = useState<CodexRetryFilterConfig>(DEFAULT_CONFIG);
  const [savedConfig, setSavedConfig] = useState<CodexRetryFilterConfig>(DEFAULT_CONFIG);
  const [stats, setStats] = useState<CodexRetryFilterStats | null>(null);
  const [hits, setHits] = useState<CodexRetryFilterHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (config.models.length === 0) {
      errors.push(t('codex_retry_filter.validation.models_required'));
    }
    if (config.reasoningTokenLengths.length === 0) {
      errors.push(t('codex_retry_filter.validation.lengths_required'));
    }
    if (config.guardRetryAttempts < 0 || !Number.isInteger(config.guardRetryAttempts)) {
      errors.push(t('codex_retry_filter.validation.guard_retry_invalid'));
    }
    if (config.enabled && !config.interceptStreaming && !config.interceptNonStreaming) {
      errors.push(t('codex_retry_filter.validation.intercept_required'));
    }
    return errors;
  }, [config, t]);

  const dirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(savedConfig), [config, savedConfig]);

  const loadData = useCallback(async () => {
    if (!connected) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextConfig, nextStats, nextHits] = await Promise.all([
        codexRetryFilterApi.getConfig(),
        codexRetryFilterApi.getStats(),
        codexRetryFilterApi.getHits({ limit: PAGE_SIZE }),
      ]);
      setConfig(nextConfig);
      setSavedConfig(nextConfig);
      setStats(nextStats);
      setHits(nextHits.hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    void loadData();
  }, [loadData, loadKey]);

  const updateConfig = useCallback((patch: Partial<CodexRetryFilterConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
  }, []);

  const saveConfig = useCallback(async () => {
    if (validationErrors.length > 0) {
      showNotification(validationErrors[0], 'error');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const nextConfig = await codexRetryFilterApi.saveConfig(config);
      setConfig(nextConfig);
      setSavedConfig(nextConfig);
      showNotification(t('codex_retry_filter.save_success'), 'success');
      setLoadKey((key) => key + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [config, showNotification, t, validationErrors]);

  const refresh = useCallback(() => {
    setLoadKey((key) => key + 1);
  }, []);

  const metricsReady = stats && !loading;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('codex_retry_filter.title')}</h1>
          <p className={styles.subtitle}>{t('codex_retry_filter.subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryButton} onClick={refresh} disabled={loading}>
            {loading ? <IconLoader2 size={14} /> : <IconRefreshCw size={14} />}
            {t('common.refresh')}
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={saveConfig}
            disabled={saving || validationErrors.length > 0 || !dirty}
          >
            {saving ? <IconLoader2 size={14} /> : <IconCheck size={14} />}
            {t('common.save')}
          </button>
        </div>
      </div>

      {!connected ? (
        <div className={styles.errorBox}>
          <IconAlertTriangle size={16} />
          {t('notification.connection_required')}
        </div>
      ) : null}

      {error ? (
        <div className={styles.errorBox}>
          <IconAlertTriangle size={16} />
          {error}
        </div>
      ) : null}

      {config.enabled ? (
        <div className={styles.warningBox}>
          <IconAlertTriangle size={16} />
          {t('codex_retry_filter.streaming_warning')}
        </div>
      ) : null}

      {validationErrors.length > 0 ? (
        <div className={styles.validationBox}>
          {validationErrors.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}

      <section className={styles.configGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>{t('codex_retry_filter.config_title')}</h2>
            <span className={config.enabled ? styles.statusEnabled : styles.statusDisabled}>
              {config.enabled ? t('codex_retry_filter.enabled') : t('codex_retry_filter.disabled')}
            </span>
          </div>
          <div className={styles.controlStack}>
            <ToggleRow
              label={t('codex_retry_filter.enable_filter')}
              description={t('codex_retry_filter.protocol_scope')}
              checked={config.enabled}
              onChange={(enabled) => updateConfig({ enabled })}
            />
            <ToggleRow
              label={t('codex_retry_filter.intercept_streaming')}
              description={t('codex_retry_filter.intercept_streaming_desc')}
              checked={config.interceptStreaming}
              onChange={(interceptStreaming) => updateConfig({ interceptStreaming })}
            />
            <ToggleRow
              label={t('codex_retry_filter.intercept_non_streaming')}
              description={t('codex_retry_filter.intercept_non_streaming_desc')}
              checked={config.interceptNonStreaming}
              onChange={(interceptNonStreaming) => updateConfig({ interceptNonStreaming })}
            />
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>{t('codex_retry_filter.guard_retry_attempts')}</span>
              <input
                className={styles.numberInput}
                type="number"
                min={0}
                step={1}
                value={config.guardRetryAttempts}
                onChange={(event) => updateConfig({
                  guardRetryAttempts: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                })}
              />
            </label>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>{t('codex_retry_filter.matching_title')}</h2>
          </div>
          <div className={styles.controlStack}>
            <ListEditor
              label={t('codex_retry_filter.models')}
              values={config.models}
              placeholder="gpt-*"
              onChange={(values) => updateConfig({ models: normalizeModelPatterns(values) })}
            />
            <ListEditor
              label={t('codex_retry_filter.reasoning_lengths')}
              values={config.reasoningTokenLengths.map(String)}
              placeholder="516, 1034, 1552"
              inputType="number"
              onChange={(values) => updateConfig({
                reasoningTokenLengths: normalizeReasoningLengths(values.map((value) => Number(value))),
              })}
            />
          </div>
        </div>
      </section>

      <div className={styles.metricsGrid}>
        <MetricCard
          label={t('codex_retry_filter.metrics.attempts')}
          value={metricsReady ? formatNumber(stats.attempts) : '-'}
        />
        <MetricCard
          label={t('codex_retry_filter.metrics.hits')}
          value={metricsReady ? formatNumber(stats.hits) : '-'}
          hint={metricsReady ? formatPercentage(stats.hitRate) : undefined}
        />
        <MetricCard
          label={t('codex_retry_filter.metrics.retry_success_rate')}
          value={metricsReady ? formatPercentage(stats.retrySuccessRate) : '-'}
          hint={metricsReady ? `${formatNumber(stats.finalSuccessesAfterHit)} ${t('codex_retry_filter.metrics.final_successes')}` : undefined}
        />
        <MetricCard
          label={t('codex_retry_filter.metrics.internal_retries')}
          value={metricsReady ? formatNumber(stats.internalRetries) : '-'}
        />
        <MetricCard
          label={t('codex_retry_filter.metrics.conductor_retries')}
          value={metricsReady ? formatNumber(stats.conductorRetries) : '-'}
        />
        <MetricCard
          label={t('codex_retry_filter.metrics.observe_only_hits')}
          value={metricsReady ? formatNumber(stats.observeOnlyHits) : '-'}
        />
      </div>

      {stats ? (
        <div className={styles.breakdownGrid}>
          <BreakdownTable title={t('codex_retry_filter.by_model')} rows={stats.byModel} />
          <BreakdownTable title={t('codex_retry_filter.by_auth')} rows={stats.byAuth} />
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>{t('codex_retry_filter.by_reasoning_tokens')}</h2>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.compactTable}>
                <thead>
                  <tr>
                    <th>{t('codex_retry_filter.table.reasoning_tokens')}</th>
                    <th>{t('codex_retry_filter.metrics.hits')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byReasoningTokens.length ? stats.byReasoningTokens.map((row) => (
                    <tr key={row.matchedLength}>
                      <td>{formatNumber(row.matchedLength)}</td>
                      <td>{formatNumber(row.hits)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={2} className={styles.emptyCell}>{t('codex_retry_filter.no_data')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>{t('codex_retry_filter.by_action')}</h2>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.compactTable}>
                <thead>
                  <tr>
                    <th>{t('codex_retry_filter.table.action')}</th>
                    <th>{t('codex_retry_filter.metrics.hits')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byAction.length ? stats.byAction.map((row) => (
                    <tr key={row.action}>
                      <td>{actionLabel(t, row.action)}</td>
                      <td>{formatNumber(row.hits)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={2} className={styles.emptyCell}>{t('codex_retry_filter.no_data')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      <RecentHitsTable hits={hits} />
    </div>
  );
}
