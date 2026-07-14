import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconLoader2, IconRefreshCw } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { unavailableApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { UnavailableEntry } from '@/types/unavailable';
import styles from './UnavailablePage.module.scss';

interface AppliedFilters {
  provider: string;
  authIndex: string;
  model: string;
  activeOnly: boolean;
  includeNonBlocking: boolean;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = err.message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins ? `${hours}h ${remMins}m` : `${hours}h`;
}

function entryKey(entry: UnavailableEntry): string {
  return [entry.scope, entry.auth_index || entry.auth_id || '', entry.model || ''].join('|');
}

function displayAuth(entry: UnavailableEntry): string {
  return entry.label || entry.file_name || entry.auth_index || entry.auth_id || '-';
}

export function UnavailablePage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const { showNotification, showConfirmation } = useNotificationStore();

  const [items, setItems] = useState<UnavailableEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [providerInput, setProviderInput] = useState('');
  const [authIndexInput, setAuthIndexInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [activeOnlyInput, setActiveOnlyInput] = useState(true);
  const [includeNonBlockingInput, setIncludeNonBlockingInput] = useState(false);
  const [applied, setApplied] = useState<AppliedFilters>({
    provider: '',
    authIndex: '',
    model: '',
    activeOnly: true,
    includeNonBlocking: false,
  });
  const [resettingKey, setResettingKey] = useState('');

  const disableControls = connectionStatus !== 'connected';

  const loadItems = useCallback(
    async (filters: AppliedFilters) => {
      if (connectionStatus !== 'connected') {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const data = await unavailableApi.list({
          provider: filters.provider || undefined,
          auth_index: filters.authIndex || undefined,
          model: filters.model || undefined,
          active_only: filters.activeOnly,
          include_nonblocking: filters.includeNonBlocking,
        });
        setItems(data.items);
        setTotal(data.total);
      } catch (err: unknown) {
        setError(getErrorMessage(err, t('notification.refresh_failed')));
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [connectionStatus, t]
  );

  const buildFiltersFromInputs = useCallback(
    (): AppliedFilters => ({
      provider: providerInput.trim(),
      authIndex: authIndexInput.trim(),
      model: modelInput.trim(),
      activeOnly: activeOnlyInput,
      includeNonBlocking: includeNonBlockingInput,
    }),
    [activeOnlyInput, authIndexInput, includeNonBlockingInput, modelInput, providerInput]
  );

  const applyAndLoad = useCallback(async () => {
    const next = buildFiltersFromInputs();
    setApplied(next);
    await loadItems(next);
  }, [buildFiltersFromInputs, loadItems]);

  useHeaderRefresh(applyAndLoad);

  useEffect(() => {
    void loadItems(applied);
  }, [applied, loadItems]);

  const providers = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => {
      if (item.provider) values.add(item.provider);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const blockingCount = useMemo(
    () => items.filter((item) => item.blocking).length,
    [items]
  );

  const handleToggleActiveOnly = (checked: boolean) => {
    setActiveOnlyInput(checked);
    const next: AppliedFilters = {
      ...buildFiltersFromInputs(),
      activeOnly: checked,
    };
    setApplied(next);
  };

  const handleToggleIncludeNonBlocking = (checked: boolean) => {
    setIncludeNonBlockingInput(checked);
    const next: AppliedFilters = {
      ...buildFiltersFromInputs(),
      includeNonBlocking: checked,
    };
    setApplied(next);
  };

  const handleFilterKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void applyAndLoad();
    }
  };

  const handleResetEntry = (entry: UnavailableEntry) => {
    const auth = entry.auth_index?.trim();
    if (!auth) {
      showNotification(t('unavailable.missing_auth_index'), 'error');
      return;
    }

    const isModel = entry.scope === 'model' && Boolean(entry.model);
    const key = entryKey(entry);

    showConfirmation({
      title: t('unavailable.confirm_reset_title'),
      message: isModel
        ? t('unavailable.confirm_reset_model', {
            auth,
            model: entry.model,
          })
        : t('unavailable.confirm_reset_auth', { auth }),
      confirmText: t('unavailable.reset'),
      variant: 'primary',
      onConfirm: async () => {
        setResettingKey(key);
        try {
          await unavailableApi.resetQuota({
            auth_index: auth,
            model: isModel ? entry.model : undefined,
          });
          showNotification(t('unavailable.reset_success'), 'success');
          await loadItems(applied);
        } catch (err: unknown) {
          showNotification(getErrorMessage(err, t('unavailable.reset_failed')), 'error');
        } finally {
          setResettingKey('');
        }
      },
    });
  };

  const handleResetAll = () => {
    const providerFilter = providerInput.trim();
    showConfirmation({
      title: t('unavailable.confirm_reset_all_title'),
      message: providerFilter
        ? t('unavailable.confirm_reset_all_provider', { provider: providerFilter })
        : t('unavailable.confirm_reset_all'),
      confirmText: t('unavailable.reset_all'),
      variant: 'danger',
      onConfirm: async () => {
        setResettingKey('all');
        try {
          const result = await unavailableApi.resetQuotaAll({
            provider: providerFilter || undefined,
          });
          showNotification(
            t('unavailable.reset_all_success', {
              count: result.reset_count,
              models: result.models_cleared,
            }),
            'success'
          );
          await applyAndLoad();
        } catch (err: unknown) {
          showNotification(getErrorMessage(err, t('unavailable.reset_all_failed')), 'error');
        } finally {
          setResettingKey('');
        }
      },
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('unavailable.title')}</h1>
        <p className={styles.subtitle}>{t('unavailable.description')}</p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.filterField}>
            <label htmlFor="unavailable-provider">{t('unavailable.filter_provider')}</label>
            <input
              id="unavailable-provider"
              className={styles.textInput}
              list="unavailable-provider-options"
              value={providerInput}
              onChange={(event) => setProviderInput(event.target.value)}
              onKeyDown={handleFilterKeyDown}
              placeholder={t('unavailable.filter_provider_placeholder')}
              disabled={disableControls}
            />
            <datalist id="unavailable-provider-options">
              {providers.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>

          <div className={styles.filterField}>
            <label htmlFor="unavailable-auth-index">{t('unavailable.filter_auth_index')}</label>
            <input
              id="unavailable-auth-index"
              className={styles.textInput}
              value={authIndexInput}
              onChange={(event) => setAuthIndexInput(event.target.value)}
              onKeyDown={handleFilterKeyDown}
              placeholder={t('unavailable.filter_auth_index_placeholder')}
              disabled={disableControls}
            />
          </div>

          <div className={styles.filterField}>
            <label htmlFor="unavailable-model">{t('unavailable.filter_model')}</label>
            <input
              id="unavailable-model"
              className={styles.textInput}
              value={modelInput}
              onChange={(event) => setModelInput(event.target.value)}
              onKeyDown={handleFilterKeyDown}
              placeholder={t('unavailable.filter_model_placeholder')}
              disabled={disableControls}
            />
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={activeOnlyInput}
              onChange={(event) => handleToggleActiveOnly(event.target.checked)}
              disabled={disableControls}
            />
            {t('unavailable.active_only')}
          </label>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={includeNonBlockingInput}
              onChange={(event) => handleToggleIncludeNonBlocking(event.target.checked)}
              disabled={disableControls || activeOnlyInput}
            />
            {t('unavailable.include_nonblocking')}
          </label>
        </div>

        <div className={styles.actions}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void applyAndLoad()}
            disabled={disableControls || loading}
            loading={loading}
          >
            <IconRefreshCw size={14} />
            {t('common.refresh')}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={handleResetAll}
            disabled={disableControls || loading || resettingKey === 'all'}
            loading={resettingKey === 'all'}
          >
            {t('unavailable.reset_all')}
          </Button>
        </div>
      </div>

      <div className={styles.summary}>
        <span>
          {t('unavailable.total')}: <span className={styles.summaryBadge}>{total}</span>
        </span>
        <span>
          {t('unavailable.blocking')}: <span className={styles.summaryBadge}>{blockingCount}</span>
        </span>
      </div>

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      <Card className={styles.tableCard}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('unavailable.col_scope')}</th>
                <th>{t('unavailable.col_provider')}</th>
                <th>{t('unavailable.col_auth')}</th>
                <th>{t('unavailable.col_model')}</th>
                <th>{t('unavailable.col_reason')}</th>
                <th>{t('unavailable.col_retry_after')}</th>
                <th>{t('unavailable.col_status')}</th>
                <th>{t('common.action')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    <div className={styles.loadingRow}>
                      <IconLoader2 size={16} />
                      {t('common.loading')}
                    </div>
                  </td>
                </tr>
              ) : null}

              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    <EmptyState
                      title={t('unavailable.empty_title')}
                      description={t('unavailable.empty_description')}
                    />
                  </td>
                </tr>
              ) : null}

              {items.map((entry) => {
                const key = entryKey(entry);
                const isResetting = resettingKey === key;
                return (
                  <tr key={key}>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          entry.scope === 'model' ? styles.badgeModel : styles.badgeAuth
                        }`}
                      >
                        {entry.scope === 'model'
                          ? t('unavailable.scope_model')
                          : t('unavailable.scope_auth')}
                      </span>
                    </td>
                    <td>
                      <div className={styles.stack}>
                        <span>{entry.provider || '-'}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.stack}>
                        <span>{displayAuth(entry)}</span>
                        {entry.auth_index ? (
                          <span className={`${styles.mono} ${styles.muted}`}>
                            {entry.auth_index}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <span className={styles.mono}>{entry.model || '-'}</span>
                    </td>
                    <td className={styles.reasonCell}>
                      <div className={styles.stack}>
                        <span>{entry.reason || entry.status_message || '-'}</span>
                        {entry.last_error?.message &&
                        entry.last_error.message !== entry.reason ? (
                          <span className={styles.muted}>{entry.last_error.message}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className={styles.stack}>
                        <span>{formatDuration(entry.retry_after_seconds)}</span>
                        <span className={styles.muted}>
                          {formatDateTime(entry.next_retry_after)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.stack}>
                        <span
                          className={`${styles.badge} ${
                            entry.blocking ? styles.badgeBlocking : styles.badgeSoft
                          }`}
                        >
                          {entry.blocking
                            ? t('unavailable.status_blocking')
                            : t('unavailable.status_soft')}
                        </span>
                        {entry.quota?.exceeded ? (
                          <span className={styles.muted}>
                            {t('unavailable.quota_exceeded')}
                            {entry.quota.backoff_level
                              ? ` · L${entry.quota.backoff_level}`
                              : ''}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleResetEntry(entry)}
                          disabled={disableControls || !entry.auth_index || isResetting}
                          loading={isResetting}
                        >
                          {t('unavailable.reset')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
