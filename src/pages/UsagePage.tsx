import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { usageApi } from '@/services/api';
import {
  IconLoader2,
  IconAlertTriangle,
  IconSettings,
  IconInfo,
  IconX,
} from '@/components/ui/icons';
import { Select, type SelectOption } from '@/components/ui/Select';
import type {
  MetricsResponse,
  UsageEventsResponse,
  UsageEvent,
  FilterOption,
  FiltersResponse,
} from '@/types/usage';
import styles from './UsagePage.module.scss';

function formatProviderDisplay(
  providerKey: string,
  providerLabel: string,
  authPosition?: string
): string {
  if (providerLabel && providerLabel !== providerKey && !providerLabel.startsWith(providerKey + '-')) {
    return providerLabel;
  }
  if (authPosition) {
    return `${providerKey}#${authPosition}`;
  }
  return providerKey;
}

type DatePreset = '1h' | '6h' | '24h' | '7d' | '30d';

const PRESETS: DatePreset[] = ['1h', '6h', '24h', '7d', '30d'];

const PRESET_LABELS: Record<DatePreset, string> = {
  '1h': '1h',
  '6h': '6h',
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const INLINE_ERROR_MAX_LENGTH = 520;

function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function formatLargeTokenCount(value: number): string {
  if (value < 1_000_000) return value.toLocaleString();
  const units = [
    { suffix: 'T', value: 1_000_000_000_000 },
    { suffix: 'B', value: 1_000_000_000 },
    { suffix: 'M', value: 1_000_000 },
  ];
  const unit = units.find((item) => value >= item.value) ?? units[units.length - 1];
  const scaled = value / unit.value;
  const formatted = scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2);
  return `${formatted.replace(/\.0+$|(?<=\.\d)0+$/, '')}${unit.suffix}`;
}

function formatErrorSummary(event: UsageEvent): string {
  const detail = getErrorDetailText(event);
  const statusParts: string[] = [];
  if (event.http_status) statusParts.push(`HTTP ${event.http_status}`);
  if (event.upstream_status && event.upstream_status !== event.http_status) {
    statusParts.push(`upstream ${event.upstream_status}`);
  }

  const statusPrefix = statusParts.length ? `[${statusParts.join(' / ')}]` : '';
  if (detail) {
    return [statusPrefix, truncateInlineText(detail, INLINE_ERROR_MAX_LENGTH)].filter(Boolean).join(' ');
  }

  const fallbackParts: string[] = [];
  if (event.http_status) fallbackParts.push(String(event.http_status));
  if (event.error_code && event.error_code !== httpStatusText(event.http_status)) {
    fallbackParts.push(event.error_code);
  }
  if (event.error_stage && !fallbackParts.length) fallbackParts.push(event.error_stage);
  return fallbackParts.join(' ') || '-';
}

function httpStatusText(status: number | undefined): string {
  if (!status) return '';
  if (status === 400) return 'Bad Request';
  if (status === 401) return 'Unauthorized';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not Found';
  if (status === 429) return 'Rate Limited';
  if (status === 502) return 'Bad Gateway';
  if (status === 503) return 'Service Unavailable';
  if (status === 504) return 'Gateway Timeout';
  return '';
}

function parseErrorBody(body: string | undefined): string {
  if (!body) return '';
  const htmlMatch = body.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (htmlMatch) {
    return htmlMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
  if (body.startsWith('<')) {
    const text = body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return text || '(HTML response)';
  }
  try {
    const parsed = JSON.parse(body);
    const msg = parsed?.error?.message || parsed?.message || parsed?.error || parsed;
    if (typeof msg === 'string') return msg;
    if (typeof msg === 'object') return JSON.stringify(msg);
    return body;
  } catch {
    return body;
  }
}

function getErrorDetailText(event: UsageEvent): string {
  const candidates = [event.provider_error_raw, event.error_message];
  const parsed = candidates
    .map((body) => parseErrorBody(body))
    .map((body) => body.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return parsed.find((body) => !isGenericStatusMessage(body, event.http_status)) || parsed[0] || '';
}

function isGenericStatusMessage(message: string, status: number | undefined): boolean {
  const normalized = message.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normalized) return true;
  if (status && normalized === String(status)) return true;
  const statusText = httpStatusText(status).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return Boolean(statusText && (normalized === statusText || normalized === `${status} ${statusText}`));
}

function truncateInlineText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

/* ─────────── Portal Popover wrapper ─────────── */
function PortalPopover({
  children,
  triggerRef,
  onClose,
  className,
}: {
  children: ReactNode;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const popoverH = Math.min(260, spaceBelow);
    setStyle({
      position: 'fixed',
      top: Math.min(rect.bottom + 4, window.innerHeight - popoverH - 8),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 400)),
      zIndex: 9999,
    });
  }, [triggerRef]);

  if (!style || typeof document === 'undefined') return null;
  return createPortal(
    <div ref={ref} className={className || ''} style={style}>
      {children}
    </div>,
    document.body
  );
}

/* ─────────── Token tooltip popover ─────────── */
function TokenPopover({
  event,
  triggerRef,
  onClose,
}: {
  event: UsageEvent;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <PortalPopover triggerRef={triggerRef} onClose={onClose} className={styles.tokenPopover}>
      <div className={styles.tokenPopoverHead}>
        <span>{t('usage.token_breakdown')}</span>
        <button type="button" className={styles.tokenPopoverClose} onClick={onClose}>
          <IconX size={12} />
        </button>
      </div>
      <div className={styles.tokenPopoverBody}>
        <div className={styles.tokenPopoverRow}>
          <span>{t('usage.token_prompt')}</span><span>{event.prompt_tokens.toLocaleString()}</span>
        </div>
        <div className={styles.tokenPopoverRow}>
          <span>{t('usage.token_completion')}</span><span>{event.completion_tokens.toLocaleString()}</span>
        </div>
        <div className={styles.tokenPopoverRow}>
          <span>{t('usage.token_reasoning')}</span><span>{event.reasoning_tokens.toLocaleString()}</span>
        </div>
        <div className={styles.tokenPopoverRow}>
          <span>{t('usage.token_cached')}</span><span>{event.cached_tokens.toLocaleString()}</span>
        </div>
        <div className={`${styles.tokenPopoverRow} ${styles.tokenPopoverRowTotal}`}>
          <span>{t('usage.token_total')}</span><span>{event.total_tokens.toLocaleString()}</span>
        </div>
      </div>
    </PortalPopover>
  );
}

/* ─────────── Error popover ─────────── */
function ErrorPopover({
  event,
  triggerRef,
  onClose,
}: {
  event: UsageEvent;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const parsedBody = useMemo(() => {
    return getErrorDetailText(event);
  }, [event]);

  return (
    <PortalPopover triggerRef={triggerRef} onClose={onClose} className={styles.errorPopover}>
      <div className={styles.errorPopoverHead}>
        <span>{t('usage.error_details')}</span>
        <button type="button" className={styles.tokenPopoverClose} onClick={onClose}>
          <IconX size={12} />
        </button>
      </div>
      <div className={styles.errorPopoverBody}>
        <div className={styles.errorPopoverRow}>
          <span>HTTP {event.http_status || '-'}</span>
          {event.upstream_status && event.upstream_status !== event.http_status ? (
            <span> (upstream {event.upstream_status})</span>
          ) : null}
        </div>
        {event.error_stage ? <div className={styles.errorPopoverRow}><span>{t('usage.error_stage')}:</span> {event.error_stage}</div> : null}
        {event.error_code ? <div className={styles.errorPopoverRow}><span>{t('usage.error_code')}:</span> {event.error_code}</div> : null}
        {parsedBody ? (
          <div className={styles.errorPopoverDivider} />
        ) : null}
        {parsedBody ? <div className={styles.errorPopoverRowFull}>{parsedBody}</div> : null}
      </div>
    </PortalPopover>
  );
}

/* ─────────── Metrics Card ─────────── */
function MetricsCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className={styles.metricsCard}>
      <span className={styles.metricsValue}>{value}</span>
      <span className={styles.metricsLabel}>{label}</span>
      {sublabel ? <span className={styles.metricsSublabel}>{sublabel}</span> : null}
    </div>
  );
}

function DateTimeInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input || disabled) return;
    input.focus();
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.click();
  };

  return (
    <div className={styles.dateInputWrap}>
      <span>{label}</span>
      <div className={styles.dateInputShell}>
        <input
          ref={inputRef}
          type="datetime-local"
          className={styles.dateInput}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className={styles.datePickerBtn}
          onClick={openPicker}
          disabled={disabled}
          aria-label={label}
        />
      </div>
    </div>
  );
}

/* ─────────── Event Row ─────────── */
function EventRow({
  event,
  tokenPopoverId,
  errorPopoverId,
  onTokenClick,
  onErrorClick,
}: {
  event: UsageEvent;
  tokenPopoverId: number | null;
  errorPopoverId: number | null;
  onTokenClick: (id: number) => void;
  onErrorClick: (id: number) => void;
}) {
  const { t } = useTranslation();
  const tokenBtnRef = useRef<HTMLButtonElement | null>(null);
  const errorBtnRef = useRef<HTMLButtonElement | null>(null);
  const date = new Date(event.started_at);
  const timeStr = date.toLocaleTimeString();
  const isSuccess = event.status === 'success';
  const showTokenPopover = tokenPopoverId === event.id;
  const showErrorPopover = errorPopoverId === event.id;

  return (
    <tr className={styles.eventRow}>
      <td className={styles.cellTime}>{timeStr}</td>
      <td className={styles.cellProvider}>
        {formatProviderDisplay(event.provider_key, event.provider_label, event.auth_position)}
      </td>
      <td className={styles.cellModel}>{event.model}</td>
      <td className={styles.cellDuration}>{formatDuration(event.duration_ms)}</td>
      <td className={styles.cellTokens}>
        <span className={styles.cellTokensInner}>
          {event.total_tokens.toLocaleString()}
          <button
            ref={tokenBtnRef}
            type="button"
            className={styles.tokenHelpBtn}
            onClick={() => onTokenClick(event.id)}
            title="Token breakdown"
          >
            <IconInfo size={12} />
          </button>
        </span>
        {showTokenPopover ? (
          <TokenPopover event={event} triggerRef={tokenBtnRef} onClose={() => onTokenClick(event.id)} />
        ) : null}
      </td>
      <td className={styles.cellStatus}>
        <span className={isSuccess ? styles.badgeSuccess : styles.badgeFailure}>
          {isSuccess ? t('common.success') : t('common.failure')}
        </span>
      </td>
      <td className={styles.cellError}>
        {event.status !== 'success' ? (
          <div className={styles.cellErrorInner}>
            <button
              ref={errorBtnRef}
              type="button"
              className={styles.cellErrorBtn}
              onClick={() => onErrorClick(event.id)}
              title={formatErrorSummary(event)}
            >
              {formatErrorSummary(event)}
            </button>
            {showErrorPopover ? (
              <ErrorPopover event={event} triggerRef={errorBtnRef} onClose={() => onErrorClick(event.id)} />
            ) : null}
          </div>
        ) : (
          <span className={styles.cellErrorDash}>-</span>
        )}
      </td>
    </tr>
  );
}

/* ─────────── Provider Breakdown Card ─────────── */
function ProviderBreakdownCard({
  provider,
}: {
  provider: { provider_key: string; provider_label: string; auth_position?: string; successful_requests: number; failed_requests: number; requests: number; tokens: number; success_rate: number };
}) {
  const { t } = useTranslation();
  const total = provider.successful_requests + provider.failed_requests;
  const successPct = total > 0 ? (provider.success_rate * 100).toFixed(0) : '-';
  return (
    <div className={styles.providerBreakdownCard}>
      <span className={styles.providerBreakdownName}>
        {formatProviderDisplay(provider.provider_key, provider.provider_label, provider.auth_position)}
      </span>
      <div className={styles.providerBreakdownStatsRow}>
        <span className={`${styles.providerStatPill} ${styles.providerStatSuccess}`}>
          {t('stats.success')}: {provider.successful_requests}
        </span>
        <span className={`${styles.providerStatPill} ${styles.providerStatFail}`}>
          {t('stats.failure')}: {provider.failed_requests}
        </span>
      </div>
      <div className={styles.providerBreakdownBar}>
        <div
          className={styles.providerBreakdownBarFill}
          style={{ width: `${provider.success_rate * 100}%` }}
        />
      </div>
      <span className={styles.providerBreakdownRate}>
        {successPct}% · {provider.requests} req · {provider.tokens.toLocaleString()} tok
      </span>
    </div>
  );
}

/* ─────────── Main Page ─────────── */
export function UsagePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const connectionStatus = useAuthStore((s) => s.connectionStatus);
  const connected = connectionStatus === 'connected';

  /* ── Date/time filter ── */
  const [preset, setPreset] = useState<DatePreset | null>('24h');
  const [customMode, setCustomMode] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatDateInput(d);
  });
  const [dateTo, setDateTo] = useState('');

  /* ── Filters ── */
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [providerOptions, setProviderOptions] = useState<FilterOption[]>([]);
  const providerFilterKey = useMemo(() => {
    const parts = providerFilter.split('|');
    return parts[0] || '';
  }, [providerFilter]);
  const providerFilterLabel = useMemo(() => {
    const parts = providerFilter.split('|');
    return parts[1] || '';
  }, [providerFilter]);
  const providerFilterAuthId = useMemo(() => {
    const parts = providerFilter.split('|');
    return parts[2] || '';
  }, [providerFilter]);
  const providerSelectOptions = useMemo<SelectOption[]>(() => [
    { value: '', label: t('usage.filter_all') },
    ...providerOptions.map((opt) => {
      const compound = opt.key + '|' + (opt.label || '') + '|' + (opt.auth_id || '');
      const isDefault = !opt.label || opt.label === opt.key || opt.label === `${opt.key}-apikey`;
      const display = isDefault && opt.auth_position
        ? `${opt.key}#${opt.auth_position}`
        : (opt.label || opt.key);
      return { value: compound, label: display };
    }),
  ], [providerOptions, t]);
  const pageSizeOptions = useMemo<SelectOption[]>(() =>
    PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) })),
  []);
  const statusOptions = useMemo<SelectOption[]>(() => [
    { value: '', label: t('usage.filter_all') },
    { value: 'success', label: t('common.success') },
    { value: 'failure', label: t('common.failure') },
  ], [t]);

  /* ── Pagination ── */
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(0);

  /* ── Data ── */
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [events, setEvents] = useState<UsageEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  /* ── Tooltip state ── */
  const [tokenPopoverId, setTokenPopoverId] = useState<number | null>(null);
  const [errorPopoverId, setErrorPopoverId] = useState<number | null>(null);

  const dateRange = useMemo(() => {
    const from = parseDateInput(dateFrom);
    const to = parseDateInput(dateTo);
    const result: Record<string, string> = {};
    if (from) result.date_from = from.toISOString();
    if (customMode && to) result.date_to = to.toISOString();
    return result;
  }, [dateFrom, dateTo, customMode]);

  /* ── Load effect (triggered by loadKey or any filter change) ── */
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    const params: Record<string, string> = {};
    if (dateRange) {
      params.date_from = dateRange.date_from;
      params.date_to = dateRange.date_to;
    }
    if (providerFilterKey) params.provider = providerFilterKey;
    if (providerFilterLabel) params.provider_label = providerFilterLabel;
    if (providerFilterAuthId) params.auth_id = providerFilterAuthId;
    if (statusFilter) params.status = statusFilter;

    const loadUsageData = async () => {
      setLoading(true);
      setEventsLoading(true);
      await Promise.all([
        usageApi.getMetrics(params).then((data) => {
          if (!cancelled) setMetrics(data);
        }).catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        }).finally(() => {
          if (!cancelled) setLoading(false);
        }),
        usageApi.getEvents({
          ...params,
          include_error_raw: true,
          limit: pageSize,
          offset: page * pageSize,
          sort: 'started_at',
          order: 'DESC',
        }).then((data) => {
          if (!cancelled) setEvents(data);
        }).catch(() => {}).finally(() => {
          if (!cancelled) setEventsLoading(false);
        }),
      ]);
    };

    void loadUsageData();
    return () => {
      cancelled = true;
    };
  }, [connected, loadKey, dateRange, providerFilterKey, providerFilterLabel, providerFilterAuthId, statusFilter, pageSize, page]);

  /* ── Load filters on mount ── */
  useEffect(() => {
    if (!connected) return;
    usageApi.getFilters().then((data: FiltersResponse) => {
      setProviderOptions(data.providers || []);
    }).catch(() => {});
  }, [connected]);

  /* ── Handlers ── */
  const handlePresetChange = useCallback((newPreset: DatePreset) => {
    setPreset(newPreset);
    setCustomMode(false);
    const now2 = new Date();
    const from = new Date(now2);
    switch (newPreset) {
      case '1h': from.setHours(from.getHours() - 1); break;
      case '6h': from.setHours(from.getHours() - 6); break;
      case '24h': from.setDate(from.getDate() - 1); break;
      case '7d': from.setDate(from.getDate() - 7); break;
      case '30d': from.setDate(from.getDate() - 30); break;
    }
    setDateFrom(formatDateInput(from));
    setDateTo('');
    setPage(0);
  }, []);

  const handleCustomToggle = useCallback(() => {
    setCustomMode(true);
    setPreset(null);
    setPage(0);
  }, []);

  const handleDateFromChange = useCallback((value: string) => {
    setDateFrom(value);
    setPage(0);
  }, []);

  const handleDateToChange = useCallback((value: string) => {
    setDateTo(value);
    setPage(0);
  }, []);

  const handleStatusFilter = useCallback((status: string) => {
    setStatusFilter(status);
    setPage(0);
  }, []);

  const handleProviderFilter = useCallback((prov: string) => {
    setProviderFilter(prov);
    setPage(0);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(0);
  }, []);

  const handleRefresh = useCallback(() => {
    setPage(0);
    setLoadKey(k => k + 1);
  }, []);

  const totalPages = events ? Math.ceil(events.total / pageSize) : 0;
  const [pageJump, setPageJump] = useState('');
  const handlePageJump = useCallback(() => {
    const target = parseInt(pageJump, 10);
    if (!isNaN(target) && target >= 1 && target <= totalPages) {
      setPage(target - 1);
    }
    setPageJump('');
  }, [pageJump, totalPages]);

  const metricsReady = metrics && !loading;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('usage.title')}</h1>
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.presets}>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`${styles.presetBtn} ${p === preset ? styles.presetActive : ''}`.trim()}
                onClick={() => handlePresetChange(p)}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
            <span className={styles.presetDivider} />
            <button
              type="button"
              className={`${styles.presetBtn} ${customMode ? styles.presetActive : ''}`.trim()}
              onClick={handleCustomToggle}
            >
              {t('usage.custom_range')}
            </button>
          </div>
          <div className={`${styles.dateRangeGroup} ${customMode ? styles.dateRangeGroupActive : ''}`}>
            <DateTimeInput
              label={t('usage.range_from')}
              value={dateFrom}
              disabled={!customMode}
              onChange={handleDateFromChange}
            />
            <span className={styles.dateSep}>-</span>
            <DateTimeInput
              label={t('usage.range_to')}
              value={dateTo}
              disabled={!customMode}
              onChange={handleDateToChange}
            />
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Select
            className={`${styles.filterSelect} ${styles.providerFilterSelect}`}
            value={providerFilter}
            options={providerSelectOptions}
            onChange={handleProviderFilter}
            ariaLabel={t('usage.provider')}
            fullWidth={false}
            size="sm"
          />
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? <IconLoader2 size={14} /> : null}
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error ? (
        <div className={styles.errorBox}>
          <IconAlertTriangle size={16} />
          <span>
            {error.toLowerCase().includes('usage statistics are disabled')
              ? t('usage.disabled_message')
              : error}
          </span>
          {error.toLowerCase().includes('usage statistics are disabled') ? (
            <button
              type="button"
              className={styles.configBtn}
              onClick={() => navigate('/config')}
            >
              <IconSettings size={14} />
              {t('usage.go_to_config')}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Metrics cards ── */}
      <div className={styles.metricsGrid}>
        <MetricsCard
          label={t('usage.total_requests')}
          value={metricsReady ? String(metrics.total_requests) : '-'}
        />
        <MetricsCard
          label={t('usage.total_tokens')}
          value={metricsReady ? formatLargeTokenCount(metrics.total_tokens) : '-'}
          sublabel={metricsReady && metrics.total_tokens > 0
            ? `cache ${(metrics.total_cached_tokens / metrics.total_tokens * 100).toFixed(1)}%`
            : undefined}
        />
        <MetricsCard
          label={t('usage.success_rate')}
          value={metricsReady ? `${(metrics.success_rate * 100).toFixed(1)}%` : '-'}
          sublabel={
            metricsReady
              ? `${metrics.successful_requests} / ${metrics.failed_requests}`
              : undefined
          }
        />
        <MetricsCard
          label="RPM"
          value={metricsReady ? metrics.rpm.toFixed(1) : '-'}
        />
        <MetricsCard
          label="TPM"
          value={metricsReady ? metrics.tpm.toFixed(0) : '-'}
        />
      </div>

      {/* ── Events table ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('usage.recent_requests')}</h2>
          <div className={styles.filterRow}>
            <Select
              className={styles.filterSelect}
              value={String(pageSize)}
              options={pageSizeOptions}
              onChange={(nextValue) => handlePageSizeChange(Number(nextValue))}
              ariaLabel={t('usage.page_size', { defaultValue: 'Page size' })}
              fullWidth={false}
              size="sm"
            />
            <Select
              className={styles.filterSelect}
              value={statusFilter}
              options={statusOptions}
              onChange={handleStatusFilter}
              ariaLabel={t('usage.status')}
              fullWidth={false}
              size="sm"
            />
          </div>
        </div>

        {eventsLoading ? (
          <div className={styles.loadingState}>
            <IconLoader2 size={20} />
          </div>
        ) : events && events.events.length > 0 ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.thTime}>{t('usage.time')}</th>
                    <th className={styles.thProvider}>{t('usage.provider')}</th>
                    <th className={styles.thModel}>{t('usage.model')}</th>
                    <th className={styles.thDuration}>{t('usage.duration')}</th>
                    <th className={styles.thTokens}>{t('usage.tokens')}</th>
                    <th className={styles.thStatus}>{t('usage.status')}</th>
                    <th className={styles.thError}>{t('usage.error')}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.events.map((ev) => (
                    <EventRow
                      key={ev.id}
                      event={ev}
                      tokenPopoverId={tokenPopoverId}
                      errorPopoverId={errorPopoverId}
                      onTokenClick={(id) =>
                        setTokenPopoverId(tokenPopoverId === id ? null : id)
                      }
                      onErrorClick={(id) =>
                        setErrorPopoverId(errorPopoverId === id ? null : id)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page <= 0}
                onClick={() => {
                  const next = page - 1;
                  setPage(next);
                }}
              >
                {t('common.back')}
              </button>
              <span className={styles.pageInfo}>
                {page + 1} / {Math.max(totalPages, 1)}
              </span>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page >= totalPages - 1}
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                }}
              >
                {t('common.next')}
              </button>
              <span className={styles.pageJumpGroup}>
                <input
                  type="number"
                  className={styles.pageJumpInput}
                  value={pageJump}
                  onChange={(e) => setPageJump(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePageJump(); }}
                  min={1}
                  max={totalPages}
                  placeholder={t('usage.page_jump')}
                />
                <button
                  type="button"
                  className={styles.pageJumpBtn}
                  onClick={handlePageJump}
                >
                  GO
                </button>
              </span>
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            {t('usage.no_events')}
          </div>
        )}
      </section>

      {/* ── Provider breakdown (below events) ── */}
      {metricsReady && metrics.provider_success_rates.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('usage.provider_breakdown')}</h2>
          <div className={styles.providerBreakdownGrid}>
            {metrics.provider_success_rates.map((p) => (
              <ProviderBreakdownCard key={`${p.provider_key}|${p.auth_id || ''}`} provider={p} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
