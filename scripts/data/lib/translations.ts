/**
 * Lecture et validation de fichiers de traductions (JSON ou CSV) destinés à la table `translations`.
 * Format CSV (séparateur virgule ou point-virgule, guillemets doubles) :
 *   entity_kind,entity_key,field,lang,value,source
 *   item,1,name,fr,Oignon triste,traduction communautaire
 */
import { z } from 'zod';

export const translationRow = z.object({
  entity_kind: z.enum(['item', 'trinket', 'consumable', 'character', 'boss', 'floor', 'transformation']),
  entity_key: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/),
  field: z.enum(['name', 'description']),
  lang: z.literal('fr'),
  value: z.string().trim().min(1).max(4000),
  source: z.string().trim().max(300).optional().nullable(),
});
export type TranslationRow = z.infer<typeof translationRow>;

export function parseCsv(content: string): Record<string, string>[] {
  const text = content.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  const [header, ...data] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}

export interface ParseResult {
  valid: TranslationRow[];
  errors: { line: number; message: string }[];
  duplicates: number;
}

/** Valide chaque ligne, déduplique (la dernière occurrence l'emporte) et rapporte les erreurs ligne par ligne. */
export function parseTranslations(content: string, format: 'json' | 'csv'): ParseResult {
  let raw: unknown[];
  if (format === 'json') {
    const data = JSON.parse(content) as unknown;
    raw = Array.isArray(data) ? data : ((data as { translations?: unknown[] }).translations ?? []);
  } else raw = parseCsv(content);
  const errors: ParseResult['errors'] = [];
  const byKey = new Map<string, TranslationRow>();
  let duplicates = 0;
  raw.forEach((r, i) => {
    const parsed = translationRow.safeParse(r);
    if (!parsed.success) {
      errors.push({ line: i + (format === 'csv' ? 2 : 1), message: parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join(' ; ') });
      return;
    }
    const k = `${parsed.data.entity_kind}:${parsed.data.entity_key}:${parsed.data.field}:${parsed.data.lang}`;
    if (byKey.has(k)) duplicates++;
    byKey.set(k, parsed.data);
  });
  return { valid: [...byKey.values()], errors, duplicates };
}
