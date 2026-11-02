import { afterEach, expect, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { ampcodeApi } from '../src/services/api/ampcode';
import { providersApi } from '../src/services/api/providers';
import { usageApi } from '../src/services/api/usage';
import { unavailableApi } from '../src/services/api/unavailable';
import { normalizeProviderGroups } from '../src/services/api/transformers';
import type { OpenAIProviderConfig, ProviderKeyConfig } from '../src/types';

const originalGet = apiClient.get;
const originalPut = apiClient.put;
afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
});

test('fork labels survive v8 provider group edits without losing metadata or credentials', async () => {
  const codex = {
    name: 'codex-group',
    label: 'group-label',
    future: true,
    keys: [{ 'api-key': 'fixture-codex', label: 'selected-provider', future: 'keep' }],
  };
  const openai = {
    name: 'gateway',
    label: 'original-gateway',
    'base-url': 'https://gateway.example',
    keys: [{ 'api-key': 'fixture-openai', future: 'key-metadata' }],
    future: 'group-metadata',
  };
  const groups: Record<string, unknown[]> = { codex: [codex], 'openai-compatibility': [openai] };
  apiClient.get = (async () => ({ 'api-keys': groups })) as typeof apiClient.get;
  apiClient.put = (async (url: string, value: unknown) => {
    groups[url.split('/').at(-1)!] = value as unknown[];
  }) as typeof apiClient.put;
  const key = (normalizeProviderGroups([codex]) as ProviderKeyConfig[])[0];
  expect(key.label).toBe('selected-provider');
  await providersApi.updateCodexConfig(key.apiKey, key.baseUrl, {
    ...key,
    label: 'edited-provider',
  });
  expect(groups.codex).toEqual([
    { ...codex, keys: [{ ...codex.keys[0], label: 'edited-provider' }] },
  ]);
  const gateway = (normalizeProviderGroups([openai], true) as OpenAIProviderConfig[])[0];
  await providersApi.updateOpenAIProvider(gateway.name, 0, { ...gateway, label: 'edited-gateway' });
  expect(groups['openai-compatibility']).toEqual([{ ...openai, label: 'edited-gateway' }]);
});

test('Amp, usage and unavailable APIs use the backend custom paths on the current connection', async () => {
  apiClient.setConfig({
    apiBase: 'https://management.example/prefix',
    managementKey: 'fixture-management',
  });
  const calls: string[] = [];
  apiClient.get = (async (url: string) => {
    calls.push(url);
    return {};
  }) as typeof apiClient.get;
  await ampcodeApi.getAmpcode();
  await usageApi.getSummary();
  await unavailableApi.list();
  expect(calls).toEqual([
    'https://management.example/prefix/v0/management/ampcode',
    'https://management.example/prefix/v0/management/api/usage/summary',
    'https://management.example/prefix/v0/management/unavailable',
  ]);
});
