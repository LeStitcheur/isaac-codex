/**
 * Traductions françaises des textes détaillés (descriptions, effets, notes, stratégies, synergies…).
 * Fichier : packages/game-data/curated/translations-fr.json, produit par `npm run data:translate`.
 *   { "model": "...", "updatedAt": "...", "entries": { "items:118:notes": { "src": "<empreinte>", "fr": "..." } } }
 * Chaque traduction est liée à l'empreinte du texte anglais d'origine : si le wiki change, l'entrée est ignorée
 * (le texte anglais à jour s'affiche) jusqu'à la prochaine traduction.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Dataset } from '../../../../packages/shared/src/index.js';

export interface TranslationEntry {
  src: string;
  fr: string;
}
export interface TranslationFile {
  model: string;
  updatedAt: string;
  entries: Record<string, TranslationEntry>;
}

export const translationsPath = (rootDir: string) => path.join(rootDir, 'packages/game-data/curated/translations-fr.json');
export const sourceHash = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 12);

/** Champs traduits par collection du jeu de données. */
export const TRANSLATED_FIELDS = {
  items: ['description', 'effects', 'notes'],
  trinkets: ['description', 'effects', 'notes'],
  consumables: ['description', 'effects', 'notes', 'horseEffect'],
  characters: ['notes', 'strategy', 'startingText', 'pickups'],
  bosses: ['rewards', 'behavior', 'notes', 'strategy'],
  achievements: ['description', 'requirement'],
  transformations: ['description', 'requirement'],
  challenges: ['goal', 'description'],
} as const;

export interface TranslationUnit {
  id: string;
  text: string;
  set: (fr: string) => void;
}

const KEY_FIELD: Record<string, string> = { achievements: 'id', challenges: 'number', items: 'id', trinkets: 'id' };

/** Tous les textes traduisibles du jeu de données, avec leur identifiant stable et un setter. */
export function translatableUnits(data: Dataset, opts: { synergies?: boolean } = {}): TranslationUnit[] {
  const units: TranslationUnit[] = [];
  for (const [coll, fields] of Object.entries(TRANSLATED_FIELDS)) {
    const list = (data as unknown as Record<string, Record<string, unknown>[]>)[coll] ?? [];
    for (const e of list) {
      const key = String(e[KEY_FIELD[coll] ?? 'slug']);
      for (const f of fields) {
        const text = e[f];
        if (typeof text !== 'string' || !/[A-Za-z]{3}/.test(text)) continue;
        units.push({ id: `${coll}:${key}:${f}`, text, set: (fr) => (e[f] = fr) });
      }
    }
  }
  if (opts.synergies !== false) {
    for (const s of data.synergies) {
      if (!/[A-Za-z]{3}/.test(s.text)) continue;
      units.push({ id: `synergy:${s.a.kind}:${s.a.key}>${s.b.kind}:${s.b.key}:${sourceHash(s.text)}`, text: s.text, set: (fr) => (s.text = fr) });
    }
  }
  return units;
}

export function readTranslations(rootDir: string): TranslationFile | null {
  const file = translationsPath(rootDir);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as TranslationFile;
}

/**
 * Applique les traductions au jeu de données (en place). La version du jeu de données reçoit un suffixe
 * dépendant des traductions appliquées, pour que la base soit réimportée quand elles changent.
 */
export function applyTranslations(data: Dataset, file: TranslationFile | null): { applied: number; total: number } {
  const units = translatableUnits(data);
  if (!file) return { applied: 0, total: units.length };
  const used = createHash('sha1');
  let applied = 0;
  for (const u of units) {
    const t = file.entries[u.id];
    if (!t || t.src !== sourceHash(u.text) || !t.fr) continue;
    u.set(t.fr);
    used.update(u.id).update(t.src).update(t.fr);
    applied++;
  }
  if (applied) data.meta.datasetVersion = `${data.meta.datasetVersion}+fr.${used.digest('hex').slice(0, 8)}`;
  return { applied, total: units.length };
}
