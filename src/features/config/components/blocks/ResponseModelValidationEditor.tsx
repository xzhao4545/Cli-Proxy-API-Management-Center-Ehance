import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { makeClientId, type ResponseModelValidationDraft } from '@/types/visualConfig';
import { FieldGrid, FieldShell } from '../fields/FieldPrimitives';
import styles from './Blocks.module.scss';

export function ResponseModelValidationEditor({
  value,
  disabled,
  describedBy,
  invalid = false,
  onChange,
}: {
  value: ResponseModelValidationDraft[];
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  onChange: (next: ResponseModelValidationDraft[]) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const key = 'config_management.visual.response_model_validation';
  const updateRule = (ruleId: string, patch: Partial<ResponseModelValidationDraft>) =>
    onChange(value.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));

  return (
    <div className={styles.blockStack}>
      {!value.length && <div className={styles.emptyState}>{t(`${key}.empty`)}</div>}
      {value.map((rule, index) => {
        const modelsId = `${id}-${rule.id}-models`;
        const modelsHintId = `${modelsId}-hint`;
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
              <Input
                label={t(`${key}.provider`)}
                hint={t(`${key}.provider_hint`)}
                placeholder="codex"
                value={rule.provider}
                disabled={disabled}
                autoComplete="off"
                spellCheck={false}
                aria-required="true"
                aria-invalid={invalid && !rule.provider.trim()}
                aria-describedby={describedBy}
                onChange={(event) => updateRule(rule.id, { provider: event.target.value })}
              />
              <Input
                label={t(`${key}.label`)}
                hint={t(`${key}.label_hint`)}
                placeholder="my-codex-upstream"
                value={rule.label}
                disabled={disabled}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={describedBy}
                onChange={(event) => updateRule(rule.id, { label: event.target.value })}
              />
            </FieldGrid>
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
