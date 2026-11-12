import { describe, expect, it } from 'vitest';
import { parseCsv, parseTranslations } from '../../scripts/data/lib/translations';
import { profileExport } from '@isaac-codex/shared';

describe('import de traductions', () => {
  it('lit un CSV avec guillemets, séparateur « ; » et BOM', () => {
    const rows = parseCsv('﻿entity_kind;entity_key;field;lang;value\nitem;1;name;fr;"Oignon ""triste"""\n');
    expect(rows).toEqual([{ entity_kind: 'item', entity_key: '1', field: 'name', lang: 'fr', value: 'Oignon "triste"' }]);
  });
  it('valide, rapporte les erreurs par ligne et déduplique', () => {
    const csv = [
      'entity_kind,entity_key,field,lang,value',
      'item,1,name,fr,Premier',
      'item,1,name,fr,Second',
      'monstre,1,name,fr,X',
      'item,1,name,en,Y',
      'item,../etc,name,fr,Z',
    ].join('\n');
    const r = parseTranslations(csv, 'csv');
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0]!.value).toBe('Second');
    expect(r.duplicates).toBe(1);
    expect(r.errors.map((e) => e.line)).toEqual([4, 5, 6]);
  });
  it('accepte le JSON (tableau ou { translations })', () => {
    const row = { entity_kind: 'character', entity_key: 'isaac', field: 'name', lang: 'fr', value: 'Isaac' };
    expect(parseTranslations(JSON.stringify([row]), 'json').valid).toHaveLength(1);
    expect(parseTranslations(JSON.stringify({ translations: [row] }), 'json').valid).toHaveLength(1);
  });
});

describe('validation des exports de profil', () => {
  const valid = {
    format: 'isaac-codex-profile', version: 1, exportedAt: '2026-01-01T00:00:00.000Z', datasetVersion: 'x', profile: { name: 'A' },
    settings: {}, unlocks: [{ achievementId: 1, status: 'unlocked' }], marks: [{ characterSlug: 'isaac', markKey: 'lamb', difficulty: 'hard' }],
    favorites: [{ kind: 'item', key: '105' }], donations: { donation: 10, greed: 0 }, items: [],
  };
  it('accepte un export valide', () => expect(profileExport.safeParse(valid).success).toBe(true));
  it('rejette un format, une marque ou un don invalides', () => {
    expect(profileExport.safeParse({ ...valid, format: 'autre' }).success).toBe(false);
    expect(profileExport.safeParse({ ...valid, marks: [{ characterSlug: 'isaac', markKey: 'inconnue', difficulty: 'hard' }] }).success).toBe(false);
    expect(profileExport.safeParse({ ...valid, donations: { donation: 5000, greed: 0 } }).success).toBe(false);
    expect(profileExport.safeParse({ ...valid, extra: 1 }).success).toBe(false);
  });
});
