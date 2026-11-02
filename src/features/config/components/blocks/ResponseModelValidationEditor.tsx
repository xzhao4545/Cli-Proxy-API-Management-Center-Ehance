import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import type { Config } from '@/types/config';
import { makeClientId, type ResponseModelValidationDraft } from '@/types/visualConfig';
import { useResponseModelOptions } from '../../hooks/useResponseModelOptions';
import {
  addResponseModel,
  responseModelCandidates,
  responseModelLabelOptions,
  responseModelSelectOptions,
} from '../../responseModelOptions';
import { responseModelNames } from '../../responseModelValidation';
import { FieldGrid, FieldShell } from '../fields/FieldPrimitives';
import styles from './Blocks.module.scss';

const EMPTY_CONFIG: Config = {};

export function ResponseModelValidationEditor({
  value,
  config = EMPTY_CONFIG,
  disabled,
  describedBy,
  invalid = false,
  onChange,
}: {
  value: ResponseModelValidationDraft[];
  config?: Config;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  onChange: (next: ResponseModelValidationDraft[]) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const key = 'config_management.visual.response_model_validation';
  const { providers, definitions } = useResponseModelOptions(config, value);
  const updateRule = (ruleId: string, patch: Partial<ResponseModelValidationDraft>) =>
    onChange(value.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));

  return (
    <div className={styles.blockStack}>
      {!value.length && <div className={styles.emptyState}>{t(`${key}.empty`)}</div>}
      {value.map((rule, index) => {
        const providerId = `${id}-${rule.id}-provider`;
        const labelId = `${id}-${rule.id}-label`;
        const modelsId = `${id}-${rule.id}-models`;
        const modelsHintId = `${modelsId}-hint`;
        const providerKey = rule.provider.trim().toLowerCase();
        const provider = providers.find((item) => item.value === providerKey);
        const selectedModels = new Set(
          responseModelNames(rule.modelsText).map((name) => name.toLowerCase())
        );
        const modelOptions = responseModelSelectOptions(
          responseModelCandidates(
            provider,
            rule.label,
            definitions[providerKey === 'gemini-cli' ? 'gemini' : providerKey]
          ).filter((name) => !selectedModels.has(name.toLowerCase()))
        );
        return (
          <div
            key={rule.id}
            role="group"
            aria-label={t(`${key}.rule`, { index: index + 1 })}
            className={styles.ruleCard}
          >
            <div className={styles.ruleCardHeader}>
              <span className={styles.ruleCardTitle}>{t(`${key}.rule`, { index: index + 1 })}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label={t(`${key}.remove`, { index: index + 1 })}
                onClick={() => onChange(value.filter((item) => item.id !== rule.id))}
              >
                {t('config_management.visual.common.delete')}
              </Button>
            </div>
            <FieldGrid>
              <FieldShell
                label={t(`${key}.provider`)}
                htmlFor={providerId}
                hint={t(`${key}.provider_hint`)}
                hintId={`${providerId}-hint`}
              >
                <Select
                  id={providerId}
                  value={rule.provider}
                  options={responseModelSelectOptions(
                    providers.map((item) => item.value),
                    rule.provider
                  )}
                  placeholder={t(`${key}.provider_placeholder`)}
                  disabled={disabled}
                  searchable
                  ariaLabel={t(`${key}.provider`)}
                  ariaInvalid={invalid && !rule.provider.trim()}
                  ariaDescribedBy={[describedBy, `${providerId}-hint`].filter(Boolean).join(' ')}
                  searchPlaceholder={t(`${key}.provider_placeholder`)}
                  noOptionsText={t(`${key}.no_options`)}
                  onChange={(next) => updateRule(rule.id, { provider: next, label: '' })}
                />
              </FieldShell>
              <FieldShell
                label={t(`${key}.label`)}
                htmlFor={labelId}
                hint={t(`${key}.label_hint`)}
                hintId={`${labelId}-hint`}
              >
                <Select
                  id={labelId}
                  value={rule.label}
                  options={[
                    { value: '', label: t(`${key}.all_labels`) },
                    ...responseModelSelectOptions(responseModelLabelOptions(provider), rule.label),
                  ]}
                  disabled={disabled || !rule.provider.trim()}
                  searchable
                  ariaLabel={t(`${key}.label`)}
                  ariaDescribedBy={[describedBy, `${labelId}-hint`].filter(Boolean).join(' ')}
                  searchPlaceholder={t(`${key}.label_placeholder`)}
                  noOptionsText={t(`${key}.no_options`)}
                  onChange={(next) => updateRule(rule.id, { label: next })}
                />
              </FieldShell>
            </FieldGrid>
            <FieldShell label={t(`${key}.select_model`)} htmlFor={`${modelsId}-select`}>
              <Select
                id={`${modelsId}-select`}
                value=""
                options={modelOptions}
                placeholder={t(`${key}.model_placeholder`)}
                disabled={disabled || !rule.provider.trim()}
                searchable
                ariaLabel={t(`${key}.select_model`)}
                ariaDescribedBy={[describedBy, modelsHintId].filter(Boolean).join(' ')}
                searchPlaceholder={t(`${key}.model_placeholder`)}
                noOptionsText={t(`${key}.no_models`)}
                onChange={(model) =>
                  updateRule(rule.id, { modelsText: addResponseModel(rule.modelsText, model) })
                }
              />
            </FieldShell>
            <FieldShell
              label={t(`${key}.models`)}
              htmlFor={modelsId}
              hint={t(`${key}.models_hint`)}
              hintId={modelsHintId}
            >
              <textarea
                id={modelsId}
                className="input"
                rows={3}
                placeholder={'gpt-5.4\ngpt-5.4-mini'}
                value={rule.modelsText}
                disabled={disabled}
                spellCheck={false}
                aria-required="true"
                aria-invalid={invalid && !rule.modelsText.trim()}
                aria-describedby={[describedBy, modelsHintId].filter(Boolean).join(' ')}
                onChange={(event) => updateRule(rule.id, { modelsText: event.target.value })}
              />
            </FieldShell>
          </div>
        );
      })}
      <div className={styles.actionRow}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() =>
            onChange([...value, { id: makeClientId(), provider: '', label: '', modelsText: '' }])
          }
        >
          {t(`${key}.add`)}
        </Button>
      </div>
    </div>
  );
}
