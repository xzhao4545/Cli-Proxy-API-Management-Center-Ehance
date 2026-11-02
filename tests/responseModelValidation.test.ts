import { expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'yaml';
import { useVisualConfig } from '../src/hooks/useVisualConfig';
import { ConfigDraftConflictError } from '../src/services/api/configPatch';
import { runVisualConfig } from './helpers/visualConfig';

const yaml = `server: {port: 8317}
response-model-validation:
  # first-provider
  - provider: codex
    label: first # keep-label-comment
    models: [gpt-5.4]
    future: first
  # second-provider
  - provider: openai-compatible-gateway
    label: second
    models: [gpt-4o]
    future: second
`;

test('response model rules save exact v8 fields, preserve rule identity and clear validation', () => {
  const loaded = runVisualConfig(yaml);
  const rows = loaded.visualValues.responseModelValidation;
  expect(loaded.visualDirty).toBe(false);
  expect(rows[0]).toMatchObject({ provider: 'codex', label: 'first', modelsText: 'gpt-5.4' });
  const config = runVisualConfig(yaml, [
    {
      responseModelValidation: [
        { ...rows[1], label: '', modelsText: ' gpt-4o \n\n gpt-4.1 ' },
        { ...rows[0], label: 'specific-provider' },
        { id: 'new', provider: ' vertex ', label: ' new-label ', modelsText: 'gemini-2.5-pro' },
      ],
    },
  ]);
  expect([...config.visualDirtyFields]).toEqual(['responseModelValidation']);
  const output = config.applyVisualChangesToYaml(yaml.replace('8317', '8318'));
  expect(parse(output)['response-model-validation']).toEqual([
    { provider: 'openai-compatible-gateway', models: ['gpt-4o', 'gpt-4.1'], future: 'second' },
    { provider: 'codex', label: 'specific-provider', models: ['gpt-5.4'], future: 'first' },
    { provider: 'vertex', label: 'new-label', models: ['gemini-2.5-pro'] },
  ]);
  expect(output).toContain('# second-provider');
  expect(output).toContain('# first-provider');
  expect(output).toContain('# keep-label-comment');
  expect(parse(output).server.port).toBe(8318);
  const cleared = runVisualConfig(yaml, [{ responseModelValidation: [] }]);
  expect(parse(cleared.applyVisualChangesToYaml(yaml))['response-model-validation']).toEqual([]);
  expect(runVisualConfig('{}').visualValues.responseModelValidation).toEqual([]);
});

test('response model rules reject incomplete drafts and concurrent edits after draft recovery', () => {
  const rows = runVisualConfig(yaml).visualValues.responseModelValidation;
  expect(
    runVisualConfig('{}', [
      { responseModelValidation: [{ id: 'new', provider: '', label: '', modelsText: 'gpt-5.4' }] },
    ]).visualValidationErrors.responseModelValidation
  ).toBe('response_model_validation_required');
  expect(
    runVisualConfig('{}', [
      {
        responseModelValidation: [{ id: 'new', provider: 'codex', label: '', modelsText: ' \n ' }],
      },
    ]).visualValidationErrors.responseModelValidation
  ).toBe('response_model_validation_required');
  const edited = runVisualConfig(yaml, [
    { responseModelValidation: [{ ...rows[1], label: 'new-label' }] },
  ]);
  expect(() =>
    edited.applyVisualChangesToYaml(yaml.replace('label: second', 'label: concurrent'))
  ).toThrow(ConfigDraftConflictError);

  let complete = false;
  function Harness() {
    const config = useVisualConfig();
    const [phase, next] = useState(0);
    if (phase === 0) config.loadVisualValuesFromYaml(yaml);
    if (phase === 1)
      config.setVisualValues({ responseModelValidation: [{ ...rows[1], label: 'new-label' }] });
    if (phase === 2) config.rebaseVisualValuesFromYaml(yaml, config.applyVisualChangesToYaml(yaml));
    if (phase === 3)
      config.setVisualValues({
        responseModelValidation: [
          { ...config.visualValues.responseModelValidation[0], modelsText: 'gpt-4.1' },
        ],
      });
    if (phase === 4) {
      const output = config.applyVisualChangesToYaml(yaml);
      expect(parse(output)['response-model-validation']).toEqual([
        {
          provider: 'openai-compatible-gateway',
          label: 'new-label',
          models: ['gpt-4.1'],
          future: 'second',
        },
      ]);
      expect(() =>
        config.applyVisualChangesToYaml(yaml.replace('future: second', 'future: concurrent'))
      ).toThrow(ConfigDraftConflictError);
      complete = true;
    } else next(phase + 1);
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  expect(complete).toBe(true);
});
