import type { Config } from '@/types/config';
import type { AuthFileItem } from '@/types/authFile';
import type { SelectOption } from '@/components/ui/Select';
import { responseModelNames } from './responseModelValidation';

export interface ResponseModelProvider {
  value: string;
  sources: Array<{ label: string; models: string[] }>;
}

const KEY_PROVIDERS = [
  ['gemini', 'geminiApiKeys', 'gemini-apikey'],
  ['gemini-interactions', 'interactionsApiKeys', 'interactions-apikey'],
  ['codex', 'codexApiKeys', 'codex-apikey'],
  ['meta', 'metaApiKeys', 'meta-apikey'],
  ['xai', 'xaiApiKeys', 'xai-apikey'],
  ['claude', 'claudeApiKeys', 'claude-apikey'],
  ['vertex', 'vertexApiKeys', 'vertex-apikey'],
] as const;

export const RESPONSE_MODEL_CHANNELS = [
  ...KEY_PROVIDERS.map(([provider]) => provider),
  'aistudio',
  'gemini-cli',
  'antigravity',
  'kimi',
  'devin',
] as const;

const uniqueNames = (names: string[]) =>
  Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));

/** Match CPA's OpenAICompatibleProviderKey, including already-prefixed names. */
export function responseModelCompatProvider(name: string): string {
  const key = name.trim().toLowerCase();
  return !key || key === 'openai-compatibility'
    ? 'openai-compatibility'
    : key.startsWith('openai-compatible-')
      ? key
      : `openai-compatible-${key}`;
}

/** Only upstream names belong here: aliases and routing prefixes are client-facing IDs. */
export function buildResponseModelProviders(
  config: Config,
  credentials: AuthFileItem[] = []
): ResponseModelProvider[] {
  const providers = new Map<string, ResponseModelProvider>();
  const ensure = (value: string) => {
    const key = value.trim().toLowerCase();
    let provider = providers.get(key);
    if (!provider) {
      provider = { value: key, sources: [] };
      providers.set(key, provider);
    }
    return provider;
  };
  RESPONSE_MODEL_CHANNELS.forEach(ensure);
  for (const [provider, configKey, defaultLabel] of KEY_PROVIDERS) {
    for (const entry of config[configKey] ?? []) {
      ensure(provider).sources.push({
        label: entry.label?.trim() || defaultLabel,
        models: uniqueNames((entry.models ?? []).map((model) => model.name)),
      });
    }
  }
  for (const entry of config.openaiCompatibility ?? []) {
    ensure(responseModelCompatProvider(entry.name)).sources.push({
      label: entry.label?.trim() || entry.name.trim(),
      models: uniqueNames((entry.models ?? []).map((model) => model.name)),
    });
  }
  for (const file of credentials) {
    const key = (file.provider || file.type || '').trim().toLowerCase();
    if (!key) continue;
    const label = typeof file.label === 'string' ? file.label.trim() : '';
    const provider = ensure(key);
    // Config credentials are already represented by their effective v8 settings.
    if (file.runtimeOnly && provider.sources.some((source) => source.label === label)) continue;
    provider.sources.push({ label, models: [] });
  }
  return Array.from(providers.values());
}

/** Keep saved custom values selectable even when their provider is currently absent. */
export function responseModelSelectOptions(names: string[], current = ''): SelectOption[] {
  return uniqueNames([...names, current]).map((value) => ({ value, label: value }));
}

export function responseModelLabelOptions(provider?: ResponseModelProvider): string[] {
  return uniqueNames((provider?.sources ?? []).map((source) => source.label));
}

export function responseModelCandidates(
  provider: ResponseModelProvider | undefined,
  label: string,
  definitions: string[] = []
): string[] {
  const sources = (provider?.sources ?? []).filter(
    (source) => !label.trim() || source.label === label.trim()
  );
  const names = sources.flatMap((source) => source.models);
  if ((!label.trim() && !sources.length) || sources.some((source) => !source.models.length)) {
    names.push(...definitions);
  }
  return uniqueNames(names);
}

export function addResponseModel(text: string, model: string): string {
  const name = model.trim();
  if (!name || responseModelNames(text).some((item) => item.toLowerCase() === name.toLowerCase())) {
    return text;
  }
  return [...responseModelNames(text), name].join('\n');
}
