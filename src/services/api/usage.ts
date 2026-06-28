import { apiClient } from './client';
import type {
  UsageEventsResponse,
  SummaryResponse,
  FailuresResponse,
  FiltersResponse,
  MetricsResponse,
  UsageQueryParams,
  UsageSummaryParams,
} from '@/types/usage';

const USAGE_TIMEOUT_MS = 15 * 1000;
const API_PREFIX = '/api/usage';

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

const asNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const normalizeEventsResponse = (payload: unknown): UsageEventsResponse => {
  const data = asRecord(payload);
  return {
    events: asArray(data.events),
    limit: asNumber(data.limit),
    offset: asNumber(data.offset),
    total: asNumber(data.total),
  };
};

const normalizeSummaryResponse = (payload: unknown): SummaryResponse => {
  const data = asRecord(payload);
  return {
    group_by: asString(data.group_by),
    rows: asArray(data.rows),
  };
};

const normalizeFailuresResponse = (payload: unknown): FailuresResponse => {
  const data = asRecord(payload);
  return {
    failures: asArray(data.failures),
  };
};

const normalizeFiltersResponse = (payload: unknown): FiltersResponse => {
  const data = asRecord(payload);
  return {
    providers: asArray(data.providers),
    provider_labels: asArray(data.provider_labels),
    models: asArray(data.models),
    client_models: asArray(data.client_models),
    response_models: asArray(data.response_models),
    auth_labels: asArray(data.auth_labels),
    auth_types: asArray(data.auth_types),
    auth_categories: asArray(data.auth_categories),
    statuses: asArray(data.statuses),
    error_stages: asArray(data.error_stages),
    error_codes: asArray(data.error_codes),
    reasoning_efforts: asArray(data.reasoning_efforts),
  };
};

const normalizeMetricsResponse = (payload: unknown): MetricsResponse => {
  const data = asRecord(payload);
  return {
    window_from: asString(data.window_from),
    window_to: asString(data.window_to),
    window_minutes: asNumber(data.window_minutes),
    total_requests: asNumber(data.total_requests),
    successful_requests: asNumber(data.successful_requests),
    failed_requests: asNumber(data.failed_requests),
    success_rate: asNumber(data.success_rate),
    total_prompt_tokens: asNumber(data.total_prompt_tokens),
    total_completion_tokens: asNumber(data.total_completion_tokens),
    total_reasoning_tokens: asNumber(data.total_reasoning_tokens),
    total_cached_tokens: asNumber(data.total_cached_tokens),
    total_tokens: asNumber(data.total_tokens),
    rpm: asNumber(data.rpm),
    tpm: asNumber(data.tpm),
    provider_success_rates: asArray(data.provider_success_rates),
    provider_request_totals: asArray(data.provider_request_totals),
    provider_token_totals: asArray(data.provider_token_totals),
    model_request_totals: asArray(data.model_request_totals),
    model_token_totals: asArray(data.model_token_totals),
  };
};

export const usageApi = {
  async getEvents(params: UsageQueryParams = {}) {
    return normalizeEventsResponse(await apiClient.get(`${API_PREFIX}/events`, {
      params,
      timeout: USAGE_TIMEOUT_MS,
    }));
  },

  async getSummary(params: UsageSummaryParams = {}) {
    return normalizeSummaryResponse(await apiClient.get(`${API_PREFIX}/summary`, {
      params,
      timeout: USAGE_TIMEOUT_MS,
    }));
  },

  async getFailures(params: UsageQueryParams = {}) {
    return normalizeFailuresResponse(await apiClient.get(`${API_PREFIX}/failures`, {
      params,
      timeout: USAGE_TIMEOUT_MS,
    }));
  },

  async getFilters(params: UsageQueryParams = {}) {
    return normalizeFiltersResponse(await apiClient.get(`${API_PREFIX}/filters`, {
      params,
      timeout: USAGE_TIMEOUT_MS,
    }));
  },

  async getMetrics(params: UsageQueryParams = {}) {
    return normalizeMetricsResponse(await apiClient.get(`${API_PREFIX}/metrics`, {
      params,
      timeout: USAGE_TIMEOUT_MS,
    }));
  },
};
