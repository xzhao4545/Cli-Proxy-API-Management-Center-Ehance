import { expect, test } from 'bun:test';
import { responseModelNotice } from '../src/features/usage/eventPresentation';

test('model notices distinguish substitutions and explicit blocks using backend matching rules', () => {
  const event = { model: 'gpt-5.4(high)', response_model: 'GPT-5.4-2026-05-13' };
  expect(responseModelNotice(event)).toBeNull();
  expect(
    responseModelNotice({ model: 'vendor/gemini-2.5-pro', response_model: 'gemini-2.5-pro-001' })
  ).toBeNull();
  expect(
    responseModelNotice({
      model: 'claude-sonnet-4-latest',
      response_model: 'claude-sonnet-4-20260513',
    })
  ).toBeNull();
  expect(responseModelNotice({ ...event, response_model: '' })).toBeNull();
  expect(responseModelNotice({ ...event, response_model: 'gpt-5.4-mini' })).toBe('mismatch');
  expect(
    responseModelNotice({ model: 'gpt-5.4-2026-05-13', response_model: 'gpt-5.4-2026-06-01' })
  ).toBe('mismatch');
  expect(responseModelNotice({ ...event, error_code: 'response_model_mismatch' })).toBe('blocked');
  expect(responseModelNotice({ ...event, error_code: 'Bad Gateway' })).toBeNull();
});
