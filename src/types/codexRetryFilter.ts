export type CodexRetryFilterAction =
  | 'pass'
  | 'observe_only'
  | 'internal_retry'
  | 'conductor_retry'
  | string;

export interface CodexRetryFilterConfig {
  enabled: boolean;
  models: string[];
  reasoningTokenLengths: number[];
  interceptStreaming: boolean;
  interceptNonStreaming: boolean;
  guardRetryAttempts: number;
}

export interface CodexRetryFilterBreakdown {
  key: string;
  label?: string;
  attempts: number;
  hits: number;
  hitRate: number;
  retrySuccessRate: number;
}

export interface CodexRetryFilterReasoningBreakdown {
  matchedLength: number;
  hits: number;
}

export interface CodexRetryFilterActionBreakdown {
  action: CodexRetryFilterAction;
  hits: number;
}

export interface CodexRetryFilterStats {
  attempts: number;
  hits: number;
  hitRate: number;
  finalSuccessesAfterHit: number;
  retrySuccessRate: number;
  internalRetries: number;
  conductorRetries: number;
  observeOnlyHits: number;
  byModel: CodexRetryFilterBreakdown[];
  byAuth: CodexRetryFilterBreakdown[];
  byReasoningTokens: CodexRetryFilterReasoningBreakdown[];
  byAction: CodexRetryFilterActionBreakdown[];
}

export interface CodexRetryFilterHit {
  id: number;
  requestId?: string;
  occurredAt: string;
  providerKey: string;
  authId?: string;
  authLabel?: string;
  model: string;
  clientModel?: string;
  responseModel?: string;
  stream: boolean;
  reasoningTokens: number;
  matchedLength: number;
  action: CodexRetryFilterAction;
  guardRetryRemaining: number;
  attempt: number;
  retried: boolean;
  finalSuccess: boolean;
  metadataJson?: string;
}

export interface CodexRetryFilterHitsResponse {
  hits: CodexRetryFilterHit[];
}

export interface CodexRetryFilterQueryParams {
  from?: string;
  to?: string;
  model?: string;
  authId?: string;
  matchedLength?: number;
  action?: string;
  limit?: number;
  offset?: number;
}
