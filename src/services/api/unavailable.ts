import { apiClient } from './client';
import type {
  ResetQuotaAllRequest,
  ResetQuotaAllResponse,
  ResetQuotaRequest,
  ResetQuotaResponse,
  UnavailableEntry,
  UnavailableLastError,
  UnavailableListParams,
  UnavailableListResponse,
  UnavailableQuotaState,
} from '@/types/unavailable';

const REQUEST_TIMEOUT_MS = 15 * 1000;

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const asBoolean = (value: unknown): boolean => value === true;

const normalizeQuota = (value: unknown): UnavailableQuotaState | undefined => {
  const data = asRecord(value);
  if (!Object.keys(data).length) return undefined;
  return {
    exceeded: asBoolean(data.exceeded),
    reason: asString(data.reason) || undefined,
    next_recover_at: asString(data.next_recover_at) || undefined,
    backoff_level: asNumber(data.backoff_level) || undefined,
  };
};

const normalizeLastError = (value: unknown): UnavailableLastError | undefined => {
  const data = asRecord(value);
  if (!Object.keys(data).length) return undefined;
  return {
    code: asString(data.code) || undefined,
    message: asString(data.message) || undefined,
    http_status: asNumber(data.http_status) || undefined,
    retriable: typeof data.retriable === 'boolean' ? data.retriable : undefined,
  };
};

const normalizeEntry = (value: unknown): UnavailableEntry => {
  const data = asRecord(value);
  return {
    scope: asString(data.scope) || 'auth',
    auth_index: asString(data.auth_index) || undefined,
    auth_id: asString(data.auth_id) || undefined,
    provider: asString(data.provider) || undefined,
    label: asString(data.label) || undefined,
    file_name: asString(data.file_name) || undefined,
    model: asString(data.model) || undefined,
    status: asString(data.status) || undefined,
    status_message: asString(data.status_message) || undefined,
    unavailable: asBoolean(data.unavailable),
    reason: asString(data.reason) || undefined,
    next_retry_after: asString(data.next_retry_after) || undefined,
    retry_after_seconds: Math.max(0, Math.trunc(asNumber(data.retry_after_seconds))),
    quota: normalizeQuota(data.quota),
    last_error: normalizeLastError(data.last_error),
    updated_at: asString(data.updated_at) || undefined,
    blocking: asBoolean(data.blocking),
  };
};

const normalizeList = (payload: unknown): UnavailableListResponse => {
  const data = asRecord(payload);
  const items = asArray(data.items).map(normalizeEntry);
  return {
    items,
    total: asNumber(data.total) || items.length,
  };
};

const serializeListParams = (params: UnavailableListParams = {}) => ({
  provider: params.provider?.trim() || undefined,
  auth_index: params.auth_index?.trim() || undefined,
  model: params.model?.trim() || undefined,
  active_only: params.active_only,
  include_nonblocking: params.include_nonblocking,
});

export const unavailableApi = {
  async list(params: UnavailableListParams = {}): Promise<UnavailableListResponse> {
    return normalizeList(
      await apiClient.get('/unavailable', {
        params: serializeListParams(params),
        timeout: REQUEST_TIMEOUT_MS,
      })
    );
  },

  async resetQuota(body: ResetQuotaRequest): Promise<ResetQuotaResponse> {
    const payload = await apiClient.post<Record<string, unknown>>('/reset-quota', {
      auth_index: body.auth_index,
      ...(body.model ? { model: body.model } : {}),
    }, {
      timeout: REQUEST_TIMEOUT_MS,
    });
    const data = asRecord(payload);
    return {
      status: asString(data.status) || 'ok',
      auth_index: asString(data.auth_index) || undefined,
      model: asString(data.model) || undefined,
      models: asArray(data.models).map(String),
      scope: asString(data.scope) || undefined,
    };
  },

  async resetQuotaAll(body: ResetQuotaAllRequest = {}): Promise<ResetQuotaAllResponse> {
    const payload = await apiClient.post<Record<string, unknown>>(
      '/reset-quota-all',
      body.provider ? { provider: body.provider } : {},
      { timeout: REQUEST_TIMEOUT_MS }
    );
    const data = asRecord(payload);
    return {
      status: asString(data.status) || 'ok',
      reset_count: asNumber(data.reset_count),
      auth_indexes: asArray(data.auth_indexes).map(String),
      models_cleared: asNumber(data.models_cleared),
      provider: asString(data.provider) || undefined,
    };
  },
};
