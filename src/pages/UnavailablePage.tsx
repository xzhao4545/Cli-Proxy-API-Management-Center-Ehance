import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconChevronDown, IconLoader2, IconRefreshCw } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { unavailableApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { UnavailableEntry } from '@/types/unavailable';
import styles from './UnavailablePage.module.scss';

const EXPIRED_REFRESH_DEBOUNCE_MS = 1500;
const COUNTDOWN_TICK_MS = 1000;

interface AppliedFilters {
  provider: string;
  authIndex: string;
  model: string;
  activeOnly: boolean;
  includeNonBlocking: boolean;
}

interface TreeAuthNode {
  key: string;
  authIndex: string;
  authId?: string;
  label: string;
  authEntry?: UnavailableEntry;
  models: UnavailableEntry[];
}

interface TreeProviderNode {
  key: string;
  provider: string;
  auths: TreeAuthNode[];
  totalEntries: number;
  blockingCount: number;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Extract partial reset-all progress from an ApiError body (HTTP 500 + status=partial). */
function parsePartialResetAll(err: unknown): {
  resetCount: number;
  modelsCleared: number;
  message: string;
} | null {
  if (!err || typeof err !== 'object') return null;
  const candidate =
    asRecord((err as { data?: unknown }).data) ||
    asRecord((err as { details?: unknown }).details);
  if (!candidate) return null;
  if (asString(candidate.status) !== 'partial') return null;

  const resetCount = asNumber(candidate.reset_count);
  const modelsCleared = asNumber(candidate.models_cleared);
  const message =
    asString(candidate.error) ||
    (err instanceof Error ? err.message : '') ||
    '';
  return { resetCount, modelsCleared, message };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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

function parseDeadlineMs(value?: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function remainingSecondsAt(deadlineMs: number | null, nowMs: number): number {
  if (deadlineMs == null) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

function isLiveBlocking(entry: UnavailableEntry, nowMs: number): boolean {
  return (
    entry.blocking &&
    remainingSecondsAt(parseDeadlineMs(entry.next_retry_after), nowMs) > 0
  );
}

function entryKey(entry: UnavailableEntry): string {
  return [entry.scope, entry.auth_index || entry.auth_id || '', entry.model || ''].join('|');
}

function displayAuth(entry: UnavailableEntry): string {
  return entry.label || entry.file_name || entry.auth_index || entry.auth_id || '-';
}

function filtersEqual(a: AppliedFilters, b: AppliedFilters): boolean {
  return (
    a.provider === b.provider &&
    a.authIndex === b.authIndex &&
    a.model === b.model &&
    a.activeOnly === b.activeOnly &&
    a.includeNonBlocking === b.includeNonBlocking
  );
}

function buildTree(items: UnavailableEntry[], nowMs: number): TreeProviderNode[] {
  const providerMap = new Map<string, Map<string, TreeAuthNode>>();

  items.forEach((entry) => {
    const provider = entry.provider?.trim() || '-';
    const authKey = entry.auth_index || entry.auth_id || displayAuth(entry);
    let authMap = providerMap.get(provider);
    if (!authMap) {
      authMap = new Map<string, TreeAuthNode>();
      providerMap.set(provider, authMap);
    }

    let authNode = authMap.get(authKey);
    if (!authNode) {
      authNode = {
        key: `${provider}|${authKey}`,
        authIndex: entry.auth_index || '',
        authId: entry.auth_id,
        label: displayAuth(entry),
        models: [],
      };
      authMap.set(authKey, authNode);
    }

    if (entry.scope === 'model') {
      authNode.models.push(entry);
    } else {
      authNode.authEntry = entry;
      authNode.label = displayAuth(entry);
      authNode.authIndex = entry.auth_index || authNode.authIndex;
      authNode.authId = entry.auth_id || authNode.authId;
    }
  });

  return Array.from(providerMap.entries())
    .map(([provider, authMap]) => {
      const auths = Array.from(authMap.values())
        .map((auth) => ({
          ...auth,
          models: [...auth.models].sort((a, b) =>
            (a.model || '').localeCompare(b.model || '')
          ),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      let totalEntries = 0;
      let blockingCount = 0;
      auths.forEach((auth) => {
        if (auth.authEntry) {
          totalEntries += 1;
          if (isLiveBlocking(auth.authEntry, nowMs)) blockingCount += 1;
        }
        totalEntries += auth.models.length;
        blockingCount += auth.models.filter((model) => isLiveBlocking(model, nowMs)).length;
      });

      return {
        key: provider,
        provider,
        auths,
        totalEntries,
        blockingCount,
      };
    })
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

function StatusBadges({
  entry,
  remaining,
}: {
  entry: UnavailableEntry;
  remaining: number;
}) {
  const { t } = useTranslation();
  const isBlocking = entry.blocking && remaining > 0;

  return (
    <div className={styles.metaStack}>
      <span className={`${styles.badge} ${isBlocking ? styles.badgeBlocking : styles.badgeSoft}`}>
        {isBlocking ? t('unavailable.status_blocking') : t('unavailable.status_soft')}
      </span>
      {entry.quota?.exceeded ? (
        <span className={styles.muted}>
          {t('unavailable.quota_exceeded')}
          {entry.quota.backoff_level ? ` · L${entry.quota.backoff_level}` : ''}
        </span>
      ) : null}
    </div>
  );
}

function CountdownCell({
  deadlineText,
  remaining,
}: {
  deadlineText?: string;
  remaining: number;
}) {
  return (
    <div className={styles.metaStack}>
      <span className={styles.countdown}>{formatDuration(remaining)}</span>
      <span className={styles.muted}>{formatDateTime(deadlineText)}</span>
    </div>
  );
}

function EntryIdentity({
  scope,
  name,
  subtitle,
  collapse,
}: {
  scope: 'auth' | 'model';
  name: string;
  subtitle?: string;
  collapse?: {
    expanded: boolean;
    disabled?: boolean;
    onToggle: () => void;
  };
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.identity}>
      <div className={styles.identityTop}>
        {collapse ? (
          <button
            type="button"
            className={styles.collapseButton}
            onClick={collapse.onToggle}
            aria-expanded={collapse.expanded}
            disabled={collapse.disabled}
          >
            <IconChevronDown
              size={14}
              className={collapse.expanded ? styles.chevronExpanded : styles.chevronCollapsed}
            />
          </button>
        ) : null}
        <span className={`${styles.badge} ${scope === 'auth' ? styles.badgeAuth : styles.badgeModel}`}>
          {scope === 'auth' ? t('unavailable.scope_auth') : t('unavailable.scope_model')}
        </span>
        <span className={styles.identityName} title={name}>
          {name}
        </span>
      </div>
      {subtitle ? (
        <div className={styles.identitySub}>
          <span className={`${styles.mono} ${styles.muted}`}>{subtitle}</span>
        </div>
      ) : null}
    </div>
  );
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [collapsedProviders, setCollapsedProviders] = useState<Record<string, true>>({});
  const [collapsedAuths, setCollapsedAuths] = useState<Record<string, true>>({});

  const appliedRef = useRef(applied);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const expiredRefreshTimerRef = useRef<number | null>(null);
  const pendingExpiredRefreshRef = useRef(false);
  const knownExpiredKeysRef = useRef<Set<string>>(new Set());
  const loadItemsRef = useRef<
    ((filters: AppliedFilters, options?: { silent?: boolean }) => Promise<void>) | null
  >(null);

  const disableControls = connectionStatus !== 'connected';

  useEffect(() => {
    appliedRef.current = applied;
  }, [applied]);

  const loadItems = useCallback(
    async (filters: AppliedFilters, options?: { silent?: boolean }) => {
      if (connectionStatus !== 'connected') {
        setLoading(false);
        return;
      }
      if (loadingRef.current) {
        pendingExpiredRefreshRef.current = true;
        return;
      }

      const requestId = ++requestIdRef.current;
      loadingRef.current = true;
      if (!options?.silent) {
        setLoading(true);
      }
      setError('');
      try {
        const data = await unavailableApi.list({
          provider: filters.provider || undefined,
          auth_index: filters.authIndex || undefined,
          model: filters.model || undefined,
          active_only: filters.activeOnly,
          include_nonblocking: filters.includeNonBlocking,
        });
        if (requestId !== requestIdRef.current) {
          return;
        }
        setItems(data.items);
        setTotal(data.total);

        // Keep keys that are still expired so we don't re-fire the same batch.
        const nextExpired = new Set<string>();
        const refreshedAt = Date.now();
        data.items.forEach((entry) => {
          const deadline = parseDeadlineMs(entry.next_retry_after);
          if (deadline != null && deadline <= refreshedAt) {
            nextExpired.add(entryKey(entry));
          }
        });
        knownExpiredKeysRef.current = nextExpired;
      } catch (err: unknown) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setError(getErrorMessage(err, t('notification.refresh_failed')));
        if (!options?.silent) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          loadingRef.current = false;
          if (!options?.silent) {
            setLoading(false);
          }
          if (pendingExpiredRefreshRef.current) {
            pendingExpiredRefreshRef.current = false;
            void loadItemsRef.current?.(appliedRef.current, { silent: true });
          }
        }
      }
    },
    [connectionStatus, t]
  );

  useEffect(() => {
    loadItemsRef.current = loadItems;
  }, [loadItems]);

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

  // Filter change -> effect loads. Same filters refresh -> load once here.
  const applyAndLoad = useCallback(async () => {
    const next = buildFiltersFromInputs();
    if (filtersEqual(appliedRef.current, next)) {
      await loadItems(next);
      return;
    }
    setApplied(next);
  }, [buildFiltersFromInputs, loadItems]);

  useHeaderRefresh(applyAndLoad);

  useEffect(() => {
    void loadItems(applied);
  }, [applied, loadItems]);

  // Local countdown clock — no backend polling.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, COUNTDOWN_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const scheduleExpiredRefresh = useCallback(() => {
    if (expiredRefreshTimerRef.current != null) return;
    expiredRefreshTimerRef.current = window.setTimeout(() => {
      expiredRefreshTimerRef.current = null;
      void loadItems(appliedRef.current, { silent: true });
    }, EXPIRED_REFRESH_DEBOUNCE_MS);
  }, [loadItems]);

  useEffect(() => {
    return () => {
      if (expiredRefreshTimerRef.current != null) {
        window.clearTimeout(expiredRefreshTimerRef.current);
      }
    };
  }, []);

  // When any countdown hits 0, batch a silent revalidate after 1.5s.
  useEffect(() => {
    let hasNewExpiry = false;
    items.forEach((entry) => {
      const deadline = parseDeadlineMs(entry.next_retry_after);
      if (deadline == null) return;
      if (deadline > nowMs) return;
      const key = entryKey(entry);
      if (knownExpiredKeysRef.current.has(key)) return;
      knownExpiredKeysRef.current.add(key);
      hasNewExpiry = true;
    });
    if (hasNewExpiry) {
      scheduleExpiredRefresh();
    }
  }, [items, nowMs, scheduleExpiredRefresh]);

  const tree = useMemo(() => buildTree(items, nowMs), [items, nowMs]);

  const blockingCount = useMemo(
    () => items.filter((item) => isLiveBlocking(item, nowMs)).length,
    [items, nowMs]
  );

  const handleToggleActiveOnly = (checked: boolean) => {
    setActiveOnlyInput(checked);
    setApplied({
      ...buildFiltersFromInputs(),
      activeOnly: checked,
    });
  };

  const handleToggleIncludeNonBlocking = (checked: boolean) => {
    setIncludeNonBlockingInput(checked);
    setApplied({
      ...buildFiltersFromInputs(),
      includeNonBlocking: checked,
    });
  };

  const handleFilterKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void applyAndLoad();
    }
  };

  const toggleProvider = (key: string) => {
    setCollapsedProviders((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: true };
    });
  };

  const toggleAuth = (key: string) => {
    setCollapsedAuths((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: true };
    });
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
          await loadItems(appliedRef.current);
        } catch (err: unknown) {
          showNotification(getErrorMessage(err, t('unavailable.reset_failed')), 'error');
        } finally {
          setResettingKey('');
        }
      },
    });
  };

  const handleResetAuthNode = (authNode: TreeAuthNode) => {
    const auth = authNode.authIndex.trim();
    if (!auth) {
      showNotification(t('unavailable.missing_auth_index'), 'error');
      return;
    }
    const key = `auth|${auth}|`;
    showConfirmation({
      title: t('unavailable.confirm_reset_title'),
      message: t('unavailable.confirm_reset_auth', { auth }),
      confirmText: t('unavailable.reset'),
      variant: 'primary',
      onConfirm: async () => {
        setResettingKey(key);
        try {
          await unavailableApi.resetQuota({ auth_index: auth });
          showNotification(t('unavailable.reset_success'), 'success');
          await loadItems(appliedRef.current);
        } catch (err: unknown) {
          showNotification(getErrorMessage(err, t('unavailable.reset_failed')), 'error');
        } finally {
          setResettingKey('');
        }
      },
    });
  };

  const handleResetAll = () => {
    // Scope must match the currently applied list filters, not dirty input text.
    const providerFilter = applied.provider.trim();
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
          await loadItems(appliedRef.current);
        } catch (err: unknown) {
          const partial = parsePartialResetAll(err);
          if (partial) {
            showNotification(
              t('unavailable.reset_all_partial', {
                count: partial.resetCount,
                models: partial.modelsCleared,
                error: partial.message || t('unavailable.reset_all_failed'),
              }),
              'warning'
            );
            await loadItems(appliedRef.current);
          } else {
            showNotification(getErrorMessage(err, t('unavailable.reset_all_failed')), 'error');
          }
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
              {tree.map((node) => (
                <option key={node.key} value={node.provider === '-' ? '' : node.provider} />
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
        {loading && items.length === 0 ? (
          <div className={styles.loadingRow}>
            <IconLoader2 size={16} />
            {t('common.loading')}
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className={styles.emptyWrap}>
            <EmptyState
              title={t('unavailable.empty_title')}
              description={t('unavailable.empty_description')}
            />
          </div>
        ) : null}

        {tree.length > 0 ? (
          <div className={styles.tree}>
            {tree.map((providerNode) => {
              const providerCollapsed = Boolean(collapsedProviders[providerNode.key]);
              return (
                <section key={providerNode.key} className={styles.providerNode}>
                  <div className={`${styles.entryRow} ${styles.providerHeader}`}>
                    <div className={styles.providerIdentity}>
                      <div className={styles.providerTitle}>
                        <button
                          type="button"
                          className={styles.collapseButton}
                          onClick={() => toggleProvider(providerNode.key)}
                          aria-expanded={!providerCollapsed}
                        >
                          <IconChevronDown
                            size={14}
                            className={
                              providerCollapsed ? styles.chevronCollapsed : styles.chevronExpanded
                            }
                          />
                        </button>
                        <span className={styles.providerName}>{providerNode.provider}</span>
                      </div>
                      <div className={styles.providerMeta}>
                        <span className={styles.summaryBadge}>{providerNode.totalEntries}</span>
                        <span>
                          {t('unavailable.blocking')}: {providerNode.blockingCount}
                        </span>
                      </div>
                    </div>
                    <div className={styles.columnHeader}>{t('unavailable.col_reason')}</div>
                    <div className={styles.columnHeader}>{t('unavailable.col_retry_after')}</div>
                    <div className={styles.columnHeader}>{t('unavailable.col_status')}</div>
                    <div className={`${styles.columnHeader} ${styles.columnHeaderAction}`}>
                      {t('unavailable.col_action')}
                    </div>
                  </div>

                  {!providerCollapsed ? (
                    <div className={styles.authList}>
                      {providerNode.auths.map((authNode) => {
                        const authCollapsed = Boolean(collapsedAuths[authNode.key]);
                        const authEntry = authNode.authEntry;
                        const authDeadline = parseDeadlineMs(authEntry?.next_retry_after);
                        const authRemaining = remainingSecondsAt(authDeadline, nowMs);
                        const authResetKey = authEntry
                          ? entryKey(authEntry)
                          : `auth|${authNode.authIndex}|`;
                        const authResetting = resettingKey === authResetKey;
                        const canCollapseAuth = authNode.models.length > 0;

                        return (
                          <div key={authNode.key} className={styles.authNode}>
                            <div className={`${styles.entryRow} ${styles.authHeader}`}>
                              <EntryIdentity
                                scope="auth"
                                name={authNode.label}
                                subtitle={
                                  authNode.authIndex && authNode.authIndex !== authNode.label
                                    ? authNode.authIndex
                                    : undefined
                                }
                                collapse={
                                  canCollapseAuth
                                    ? {
                                        expanded: !authCollapsed,
                                        onToggle: () => toggleAuth(authNode.key),
                                      }
                                    : undefined
                                }
                              />

                              {authEntry ? (
                                <>
                                  <div className={styles.reasonCell}>
                                    {authEntry.reason || authEntry.status_message || '-'}
                                  </div>
                                  <CountdownCell
                                    deadlineText={authEntry.next_retry_after}
                                    remaining={authRemaining}
                                  />
                                  <StatusBadges entry={authEntry} remaining={authRemaining} />
                                </>
                              ) : (
                                <>
                                  <div className={styles.reasonCell}>
                                    {t('unavailable.models_count', {
                                      count: authNode.models.length,
                                    })}
                                  </div>
                                  <span className={styles.placeholderDash}>-</span>
                                  <span className={styles.placeholderDash}>-</span>
                                </>
                              )}

                              <div className={styles.rowActions}>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    authEntry
                                      ? handleResetEntry(authEntry)
                                      : handleResetAuthNode(authNode)
                                  }
                                  disabled={
                                    disableControls || !authNode.authIndex || authResetting
                                  }
                                  loading={authResetting}
                                >
                                  {t('unavailable.reset')}
                                </Button>
                              </div>
                            </div>

                            {!authCollapsed && authNode.models.length > 0 ? (
                              <div className={styles.modelList}>
                                {authNode.models.map((modelEntry) => {
                                  const key = entryKey(modelEntry);
                                  const deadline = parseDeadlineMs(modelEntry.next_retry_after);
                                  const remaining = remainingSecondsAt(deadline, nowMs);
                                  const isResetting = resettingKey === key;
                                  return (
                                    <div
                                      key={key}
                                      className={`${styles.entryRow} ${styles.modelRow}`}
                                    >
                                      <EntryIdentity
                                        scope="model"
                                        name={modelEntry.model || '-'}
                                        subtitle={
                                          modelEntry.auth_index &&
                                          modelEntry.auth_index !== authNode.label
                                            ? modelEntry.auth_index
                                            : undefined
                                        }
                                      />
                                      <div className={styles.reasonCell}>
                                        {modelEntry.reason || modelEntry.status_message || '-'}
                                      </div>
                                      <CountdownCell
                                        deadlineText={modelEntry.next_retry_after}
                                        remaining={remaining}
                                      />
                                      <StatusBadges entry={modelEntry} remaining={remaining} />
                                      <div className={styles.rowActions}>
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          onClick={() => handleResetEntry(modelEntry)}
                                          disabled={
                                            disableControls ||
                                            !modelEntry.auth_index ||
                                            isResetting
                                          }
                                          loading={isResetting}
                                        >
                                          {t('unavailable.reset')}
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
