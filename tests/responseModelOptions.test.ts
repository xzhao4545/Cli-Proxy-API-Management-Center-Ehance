import { expect, test } from 'bun:test';
import { parse } from 'yaml';
import { normalizeConfigResponse } from '../src/services/api/transformers';
import {
  addResponseModel,
  buildResponseModelProviders,
  responseModelCandidates,
  responseModelCompatProvider,
  responseModelLabelOptions,
} from '../src/features/config/responseModelOptions';
import { runVisualConfig } from './helpers/visualConfig';

const source = `server: {port: 8317}
api-keys:
  codex:
    - name: display-name-is-not-label
      label: Primary
      prefix: client-prefix
      models:
        - {name: gpt-5.4, alias: client-alias}
        - {name: gpt-5.4-mini, alias: client-alias}
      keys:
        - {api-key: fixture-primary}
        - api-key: fixture-secondary
          label: primary
          models: [{name: gpt-4.1, alias: client-alias}]
    - keys: [{api-key: fixture-default}]
  interactions:
    - label: native-interactions
      models: [{name: gemini-3-pro, alias: gemini-alias}]
      keys: [{api-key: fixture-interactions}]
  openai-compatibility:
    - name: My-Gateway
      base-url: https://gateway.example.invalid/v1
      label: Gateway
      models: [{name: upstream-model, alias: public-model}]
      keys: []
`;

test('provider choices use v8 runtime keys and effective labels without client aliases', () => {
  const providers = buildResponseModelProviders(normalizeConfigResponse(parse(source)), [
    { name: 'runtime-key', provider: 'codex', label: 'Primary', runtimeOnly: true },
    { name: 'oauth-file.json', provider: 'codex', label: 'OAuth' },
  ]);
  const codex = providers.find((provider) => provider.value === 'codex');
  expect(responseModelLabelOptions(codex)).toEqual(['Primary', 'primary', 'codex-apikey', 'OAuth']);
  expect(responseModelCandidates(codex, 'Primary', ['default-model'])).toEqual([
    'gpt-5.4',
    'gpt-5.4-mini',
  ]);
  expect(responseModelCandidates(codex, 'primary', ['default-model'])).toEqual(['gpt-4.1']);
  expect(responseModelCandidates(codex, 'PRIMARY', ['default-model'])).toEqual([]);
  expect(responseModelCandidates(codex, 'codex-apikey', ['default-model'])).toEqual([
    'default-model',
  ]);
  expect(responseModelCandidates(codex, '', ['default-model'])).toEqual([
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-4.1',
    'default-model',
  ]);
  expect(providers.find((provider) => provider.value === 'gemini-interactions')?.sources).toEqual([
    { label: 'native-interactions', models: ['gemini-3-pro'] },
  ]);
  const gateway = providers.find((provider) => provider.value === 'openai-compatible-my-gateway');
  expect(responseModelLabelOptions(gateway)).toEqual(['Gateway']);
  expect(responseModelCandidates(gateway, 'Gateway')).toEqual(['upstream-model']);
  expect(responseModelCompatProvider(' OpenAI-Compatible-Already ')).toBe(
    'openai-compatible-already'
  );
  expect(responseModelCompatProvider('openai-compatibility')).toBe('openai-compatibility');
  expect(responseModelCompatProvider('')).toBe('openai-compatibility');
  expect(responseModelCandidates(codex, 'OAuth', ['default-model'])).toEqual(['default-model']);
});

test('selecting models appends once and saves resolved model IDs through the existing codec', () => {
  expect(addResponseModel(' gpt-5.4 \n\n', 'GPT-5.4')).toBe(' gpt-5.4 \n\n');
  expect(addResponseModel('gpt-5.4', ' ')).toBe('gpt-5.4');
  const modelsText = addResponseModel(addResponseModel('', 'gpt-5.4'), ' gpt-5.4-mini ');
  const config = runVisualConfig(source, [
    {
      responseModelValidation: [{ id: 'new', provider: 'codex', label: 'Primary', modelsText }],
    },
  ]);
  expect(parse(config.applyVisualChangesToYaml(source))['response-model-validation']).toEqual([
    { provider: 'codex', label: 'Primary', models: ['gpt-5.4', 'gpt-5.4-mini'] },
  ]);
});
