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

export const usageApi = {
  getEvents: (params: UsageQueryParams = {}) =>
    apiClient.get<UsageEventsResponse>(`${API_PREFIX}/events`, {
      params,
      timeout: USAGE_TIMEOUT_MS,
    }),

  getSummary: (params: UsageSummaryParams = {}) =>
    apiClient.get<SummaryResponse>(`${API_PREFIX}/summary`, {
      params,
      timeout: USAGE_TIMEOUT_MS,
    }),

  getFailures: (params: UsageQueryParams = {}) =>
    apiClient.get<FailuresResponse>(`${API_PREFIX}/failures`, {
      params,
      timeout: USAGE_TIMEOUT_MS,
    }),

  getFilters: (params: UsageQueryParams = {}) =>
    apiClient.get<FiltersResponse>(`${API_PREFIX}/filters`, {
      params,
      timeout: USAGE_TIMEOUT_MS,
    }),

  getMetrics: (params: UsageQueryParams = {}) =>
    apiClient.get<MetricsResponse>(`${API_PREFIX}/metrics`, {
      params,
      timeout: USAGE_TIMEOUT_MS,
    }),
};
