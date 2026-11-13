/** Surcouche des traductions françaises (translations-fr.json) appliquée au jeu de données. */
import { describe, expect, it } from 'vitest';
import { datasetPath, loadDatasetFile } from '../../apps/server/src/db/seed';
import { applyTranslations, sourceHash, translatableUnits, type TranslationFile } from '../../apps/server/src/db/translations';
import { loadConfig } from '../../apps/server/src/config';

const load = () => loadDatasetFile(datasetPath(loadConfig({ NODE_ENV: 'test' }).rootDir));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('traductions françaises', () => {
  it('identifie les textes traduisibles avec des identifiants stables', () => {
    const units = translatableUnits(load());
    // Un identifiant ne désigne jamais deux textes différents (quelques synergies sont en double dans le wiki).
    const byId = new Map<string, Set<string>>();
    for (const u of units) byId.set(u.id, (byId.get(u.id) ?? new Set()).add(u.text));
    expect([...byId.values()].every((texts) => texts.size === 1)).toBe(true);
    expect(units.some((u) => u.id.startsWith('items:') && u.id.endsWith(':notes'))).toBe(true);
    expect(units.some((u) => u.id.startsWith('synergy:'))).toBe(true);
    expect(translatableUnits(load(), { synergies: false }).some((u) => u.id.startsWith('synergy:'))).toBe(false);
  });

  it("applique une traduction dont l'empreinte correspond et ignore les autres", () => {
    const data = load();
    const [first, second] = translatableUnits(data);
    const version = data.meta.datasetVersion;
    const secondText = second!.text;
    const file: TranslationFile = {
      model: 'test',
      updatedAt: '2026-01-01T00:00:00.000Z',
      entries: {
        [first!.id]: { src: sourceHash(first!.text), fr: 'Texte traduit' },
        [second!.id]: { src: 'empreinte-perimee', fr: 'Ne doit pas apparaître' },
      },
    };
    expect(applyTranslations(data, file).applied).toBe(1);
    const after = translatableUnits(data);
    expect(after.find((u) => u.id === first!.id)?.text).toBe('Texte traduit');
    expect(after.find((u) => u.id === second!.id)?.text).toBe(secondText);
    expect(data.meta.datasetVersion).toMatch(new RegExp(`^${escapeRe(version)}\\+fr\\.[0-9a-f]{8}$`));
  });

  it('ne change rien sans fichier de traductions', () => {
    const data = load();
    const version = data.meta.datasetVersion;
    expect(applyTranslations(data, null).applied).toBe(0);
    expect(data.meta.datasetVersion).toBe(version);
  });
});
