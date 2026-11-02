import type { UsageEvent } from '@/types/usage';
import { HOUR_MS, MINUTE_MS } from '@/utils/time/durations';

export function formatTTFT(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < MINUTE_MS) return `${(ms / 1000).toFixed(2)}s`;
  const roundedMs = Math.round(ms / 1000) * 1000;
  const hours = Math.floor(roundedMs / HOUR_MS);
  const minutes = Math.floor((roundedMs % HOUR_MS) / MINUTE_MS);
  const seconds = (roundedMs % MINUTE_MS) / 1000;
  return `${hours ? `${hours}h` : ''}${minutes ? `${minutes}m` : ''}${seconds ? `${seconds}s` : ''}`;
}

function normalizeModel(model: string): string {
  const name = model.trim().toLowerCase();
  const suffix = name.lastIndexOf('(');
  return suffix >= 0 && name.endsWith(')') ? name.slice(0, suffix).trim() : name;
}

function isSnapshot(base: string, model: string): boolean {
  if (!model.startsWith(`${base}-`)) return false;
  return /^(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{8}|[0-9]{3})$/.test(model.slice(base.length + 1));
}

const equivalentModels = (requested: string, served: string): boolean =>
  requested === served || isSnapshot(requested, served) || isSnapshot(served, requested);

function stripProviderPrefix(model: string): string {
  const slash = model.lastIndexOf('/');
  return slash >= 0 && slash < model.length - 1 ? model.slice(slash + 1) : model;
}

/** Mirrors backend helps.IsModelSubstituted; compare upstream IDs rather than client aliases. */
export function responseModelNotice(
  event: Pick<UsageEvent, 'model' | 'response_model' | 'error_code'>
): 'mismatch' | 'blocked' | null {
  if (event.error_code === 'response_model_mismatch') return 'blocked';
  const requested = normalizeModel(event.model);
  const served = normalizeModel(event.response_model ?? '');
  if (!requested || !served || equivalentModels(requested, served)) return null;
  const cleanRequested = stripProviderPrefix(requested);
  const cleanServed = stripProviderPrefix(served);
  if (equivalentModels(cleanRequested, cleanServed)) return null;
  return equivalentModels(
    cleanRequested.replace(/-latest$/, ''),
    cleanServed.replace(/-latest$/, '')
  )
    ? null
    : 'mismatch';
}
