import { apiClient } from './client';
import type {
  CodexRetryFilterActionBreakdown,
  CodexRetryFilterBreakdown,
  CodexRetryFilterConfig,
  CodexRetryFilterHit,
  CodexRetryFilterHitsResponse,
  CodexRetryFilterQueryParams,
  CodexRetryFilterReasoningBreakdown,
  CodexRetryFilterStats,
} from '@/types/codexRetryFilter';

const ENDPOINT = '/codex-response-retry-filter';
const REQUEST_TIMEOUT_MS = 15 * 1000;

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const asBoolean = (value: unknown): boolean => value === true;

const normalizeConfig = (payload: unknown): CodexRetryFilterConfig => {
  const root = asRecord(payload);
  const data = asRecord(root['codex-response-retry-filter'] ?? payload);
  return {
    enabled: asBoolean(data.enabled),
    models: asArray<unknown>(data.models).map(String).filter(Boolean),
    reasoningTokenLengths: asArray<unknown>(data['reasoning-token-lengths'])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0),
    interceptStreaming: data['intercept-streaming'] !== false,
    interceptNonStreaming: data['intercept-non-streaming'] !== false,
    guardRetryAttempts: Math.max(0, Math.trunc(asNumber(data['guard-retry-attempts']))),
  };
};

const serializeConfig = (config: CodexRetryFilterConfig) => ({
  enabled: config.enabled,
  models: config.models,
  'reasoning-token-lengths': config.reasoningTokenLengths,
  'intercept-streaming': config.interceptStreaming,
  'intercept-non-streaming': config.interceptNonStreaming,
  'guard-retry-attempts': config.guardRetryAttempts,
});

const normalizeBreakdown = (value: unknown): CodexRetryFilterBreakdown => {
  const data = asRecord(value);
  return {
    key: asString(data.key),
    label: asString(data.label) || undefined,
    attempts: asNumber(data.attempts),
    hits: asNumber(data.hits),
    hitRate: asNumber(data.hit_rate),
    retrySuccessRate: asNumber(data.retry_success_rate),
  };
};

const normalizeReasoningBreakdown = (value: unknown): CodexRetryFilterReasoningBreakdown => {
  const data = asRecord(value);
  return {
    matchedLength: asNumber(data.matched_length),
    hits: asNumber(data.hits),
  };
};

const normalizeActionBreakdown = (value: unknown): CodexRetryFilterActionBreakdown => {
  const data = asRecord(value);
  return {
    action: asString(data.action),
    hits: asNumber(data.hits),
  };
};

const normalizeStats = (payload: unknown): CodexRetryFilterStats => {
  const data = asRecord(payload);
  return {
    attempts: asNumber(data.attempts),
    hits: asNumber(data.hits),
    hitRate: asNumber(data.hit_rate),
    finalSuccessesAfterHit: asNumber(data.final_successes_after_hit),
    retrySuccessRate: asNumber(data.retry_success_rate),
    internalRetries: asNumber(data.internal_retries),
    conductorRetries: asNumber(data.conductor_retries),
    observeOnlyHits: asNumber(data.observe_only_hits),
    byModel: asArray(data.by_model).map(normalizeBreakdown),
    byAuth: asArray(data.by_auth).map(normalizeBreakdown),
    byReasoningTokens: asArray(data.by_reasoning_tokens).map(normalizeReasoningBreakdown),
    byAction: asArray(data.by_action).map(normalizeActionBreakdown),
  };
};

const normalizeHit = (value: unknown): CodexRetryFilterHit => {
  const data = asRecord(value);
  return {
    id: asNumber(data.id),
    requestId: asString(data.request_id) || undefined,
    occurredAt: asString(data.occurred_at),
    providerKey: asString(data.provider_key),
    authId: asString(data.auth_id) || undefined,
    authLabel: asString(data.auth_label) || undefined,
    model: asString(data.model),
    clientModel: asString(data.client_model) || undefined,
    responseModel: asString(data.response_model) || undefined,
    stream: asBoolean(data.stream),
    reasoningTokens: asNumber(data.reasoning_tokens),
    matchedLength: asNumber(data.matched_length),
    action: asString(data.action),
    guardRetryRemaining: asNumber(data.guard_retry_remaining),
    attempt: asNumber(data.attempt),
    retried: asBoolean(data.retried),
    finalSuccess: asBoolean(data.final_success),
    metadataJson: asString(data.metadata_json) || undefined,
  };
};

const normalizeHits = (payload: unknown): CodexRetryFilterHitsResponse => {
  const data = asRecord(payload);
  return {
    hits: asArray(data.hits).map(normalizeHit),
    hasMore: asBoolean(data.has_more),
    nextBeforeOccurredAt: asString(data.next_before_occurred_at) || undefined,
    nextBeforeId: asNumber(data.next_before_id) || undefined,
  };
};

const serializeQueryParams = (params: CodexRetryFilterQueryParams = {}) => ({
  from: params.from || undefined,
  to: params.to || undefined,
  model: params.model || undefined,
  auth_id: params.authId || undefined,
  matched_length: params.matchedLength || undefined,
  action: params.action || undefined,
  limit: params.limit,
  offset: params.offset,
  before_occurred_at: params.beforeOccurredAt || undefined,
  before_id: params.beforeId,
});

export const codexRetryFilterApi = {
  async getConfig() {
    return normalizeConfig(await apiClient.get(ENDPOINT, { timeout: REQUEST_TIMEOUT_MS }));
  },

  async saveConfig(config: CodexRetryFilterConfig) {
    await apiClient.patch(ENDPOINT, serializeConfig(config), {
      timeout: REQUEST_TIMEOUT_MS,
    });
    return this.getConfig();
  },

  async replaceConfig(config: CodexRetryFilterConfig) {
    await apiClient.put(ENDPOINT, {
      'codex-response-retry-filter': serializeConfig(config),
    }, {
      timeout: REQUEST_TIMEOUT_MS,
    });
    return this.getConfig();
  },

  async getStats(params: CodexRetryFilterQueryParams = {}) {
    return normalizeStats(await apiClient.get(`${ENDPOINT}/stats`, {
      params: serializeQueryParams(params),
      timeout: REQUEST_TIMEOUT_MS,
    }));
  },

  async getHits(params: CodexRetryFilterQueryParams = {}) {
    return normalizeHits(await apiClient.get(`${ENDPOINT}/hits`, {
      params: serializeQueryParams(params),
      timeout: REQUEST_TIMEOUT_MS,
    }));
  },
};
