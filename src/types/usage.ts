export interface UsageEvent {
  id: number;
  request_id?: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  provider_key: string;
  provider_label: string;
  auth_id?: string;
  auth_label?: string;
  auth_index?: string;
  auth_position?: string;
  auth_type?: string;
  auth_category?: string;
  model: string;
  client_model?: string;
  response_model?: string;
  route?: string;
  stream?: boolean;
  status: string;
  http_status?: number;
  upstream_status?: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  reasoning_tokens: number;
  reasoning_effort?: string;
  cached_tokens: number;
  ttft_ms?: number;
  client_key_hash?: string;
  error_stage?: string;
  error_code?: string;
  error_message?: string;
  provider_error_raw?: string;
  metadata_json?: string;
}

export interface UsageEventsResponse {
  events: UsageEvent[];
  limit: number;
  offset: number;
  total: number;
}

export interface SummaryRow {
  day?: string;
  provider_key?: string;
  provider_label?: string;
  model?: string;
  status?: string;
  requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate: number;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
}

export interface SummaryResponse {
  group_by: string;
  rows: SummaryRow[];
}

export interface FailureRow {
  error_stage: string;
  error_code: string;
  provider_key: string;
  provider_label: string;
  model: string;
  requests: number;
  last_message: string;
  last_seen_at: string;
}

export interface FailuresResponse {
  failures: FailureRow[];
}

export interface FilterOption {
  key: string;
  label: string;
  auth_id?: string;
  auth_position?: string;
}

export interface FiltersResponse {
  providers: FilterOption[];
  provider_labels: string[];
  models: string[];
  client_models: string[];
  response_models: string[];
  auth_labels: string[];
  auth_types: string[];
  auth_categories: string[];
  statuses: string[];
  error_stages: string[];
  error_codes: string[];
  reasoning_efforts: string[];
}

export interface ProviderMetric {
  provider_key: string;
  provider_label: string;
  auth_id?: string;
  auth_position?: string;
  requests: number;
  successful_requests: number;
  failed_requests: number;
  tokens: number;
  prompt_tokens: number;
  cached_tokens: number;
  success_rate: number;
  cache_hit_rate: number;
}

export interface ModelMetric {
  model: string;
  requests: number;
  tokens: number;
}

export interface MetricsResponse {
  window_from: string;
  window_to: string;
  window_minutes: number;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate: number;
  cache_hit_rate: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_reasoning_tokens: number;
  total_cached_tokens: number;
  total_tokens: number;
  rpm: number;
  tpm: number;
  provider_success_rates: ProviderMetric[];
  provider_request_totals: ProviderMetric[];
  provider_token_totals: ProviderMetric[];
  model_request_totals: ModelMetric[];
  model_token_totals: ModelMetric[];
}

export interface UsageQueryParams {
  provider?: string;
  provider_label?: string;
  model?: string;
  client_model?: string;
  response_model?: string;
  status?: string;
  error_stage?: string;
  error_code?: string;
  auth_id?: string;
  auth_label?: string;
  auth_type?: string;
  auth_category?: string;
  stream?: string;
  reasoning_effort?: string;
  client_key_hash?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  order?: string;
  include_error_raw?: boolean;
}

export interface UsageSummaryParams extends UsageQueryParams {
  group_by?: 'day' | 'provider' | 'model' | 'provider_model' | 'status';
}
