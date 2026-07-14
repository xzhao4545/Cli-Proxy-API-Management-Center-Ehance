export type UnavailableScope = 'auth' | 'model';

export interface UnavailableQuotaState {
  exceeded?: boolean;
  reason?: string;
  next_recover_at?: string;
  backoff_level?: number;
}

export interface UnavailableLastError {
  code?: string;
  message?: string;
  http_status?: number;
  retriable?: boolean;
}

export interface UnavailableEntry {
  scope: UnavailableScope | string;
  auth_index?: string;
  auth_id?: string;
  provider?: string;
  label?: string;
  file_name?: string;
  model?: string;
  status?: string;
  status_message?: string;
  unavailable: boolean;
  reason?: string;
  next_retry_after?: string;
  retry_after_seconds: number;
  quota?: UnavailableQuotaState;
  last_error?: UnavailableLastError;
  updated_at?: string;
  blocking: boolean;
}

export interface UnavailableListResponse {
  items: UnavailableEntry[];
  total: number;
}

export interface UnavailableListParams {
  provider?: string;
  auth_index?: string;
  model?: string;
  active_only?: boolean;
  include_nonblocking?: boolean;
}

export interface ResetQuotaRequest {
  auth_index: string;
  model?: string;
}

export interface ResetQuotaResponse {
  status: string;
  auth_index?: string;
  model?: string;
  models?: string[];
  scope?: string;
}

export interface ResetQuotaAllRequest {
  provider?: string;
}

export interface ResetQuotaAllResponse {
  status: string;
  reset_count: number;
  auth_indexes: string[];
  models_cleared: number;
  provider?: string;
}
