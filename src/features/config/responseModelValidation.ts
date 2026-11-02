import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import { assertConfigListsUnchanged } from '@/services/api/configPatch';
import type { ResponseModelValidationDraft } from '@/types/visualConfig';

export const RESPONSE_MODEL_KEY = 'responseModelValidation';
export const RESPONSE_MODEL_PATH = ['response-model-validation'];
type Doc = ReturnType<typeof parseDocument>;

export const responseModelNames = (text: string) =>
  text
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);

export function readResponseModelValidation(doc: Doc): ResponseModelValidationDraft[] {
  const seq = doc.getIn(RESPONSE_MODEL_PATH, true);
  return isSeq(seq)
    ? seq.items.map((node, index) => {
        const row: Record<string, unknown> = isMap(node) ? node.toJSON() : {};
        return {
          id: `response-model-${index}`,
          provider: typeof row.provider === 'string' ? row.provider : '',
          label: typeof row.label === 'string' ? row.label : '',
          modelsText: Array.isArray(row.models)
            ? row.models.filter((model): model is string => typeof model === 'string').join('\n')
            : '',
        };
      })
    : [];
}

/** Keep rule identity, comments and unknown fields when editing a whole-list config value. */
export function writeResponseModelValidation(
  doc: Doc,
  sourceYaml: string,
  serverYaml: string,
  baseline: ResponseModelValidationDraft[],
  desired: ResponseModelValidationDraft[],
  guard: boolean
) {
  const source = parseDocument(sourceYaml);
  const seq = source.getIn(RESPONSE_MODEL_PATH, true);
  const nodes = new Map(
    baseline.map((row, index) => [row.id, isSeq(seq) ? seq.items[index] : undefined])
  );
  const rows = desired.map((row) => {
    const node = nodes.get(row.id);
    const map = isMap(node) ? node : source.createNode({});
    const prior = baseline.find((item) => item.id === row.id);
    for (const [key, value, unchanged] of [
      ['provider', row.provider.trim(), prior?.provider === row.provider],
      ['label', row.label.trim(), prior?.label === row.label],
      ['models', responseModelNames(row.modelsText), prior?.modelsText === row.modelsText],
    ] as const) {
      if (unchanged) continue;
      if (key === 'label' && !value) {
        map.delete(key);
        continue;
      }
      const old = map.get(key, true);
      if (isScalar(old) && typeof value === 'string') old.value = value;
      else {
        const replacement = source.createNode(value);
        if (isMap(old) || isSeq(old) || isScalar(old)) {
          replacement.comment = old.comment;
          replacement.commentBefore = old.commentBefore;
          replacement.spaceBefore = old.spaceBefore;
        }
        map.set(key, replacement);
      }
    }
    return map;
  });
  if (isSeq(seq)) {
    const first = seq.items[0];
    if (isMap(first)) first.commentBefore = seq.commentBefore;
    seq.items = rows;
    seq.commentBefore = rows[0]?.commentBefore;
    if (rows[0]) rows[0].commentBefore = undefined;
  } else source.setIn(RESPONSE_MODEL_PATH, source.createNode(rows));
  // An explicit empty list disables validation through the existing v8 config patch API.
  if (guard)
    assertConfigListsUnchanged(serverYaml, source.toString(), doc.toString(), [
      RESPONSE_MODEL_PATH,
    ]);
  doc.setIn(RESPONSE_MODEL_PATH, source.getIn(RESPONSE_MODEL_PATH, true));
}
