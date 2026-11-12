/**
 * Importe des traductions (JSON ou CSV) dans la base SQLite, avec validation Zod, déduplication
 * et vérification que chaque entité existe. Les données du jeu ne sont jamais modifiées.
 *
 * Usage : npm run data:import -- <fichier.csv|json> [--db data/isaac-codex.sqlite] [--dry-run]
 * (Arrêtez le serveur ou redémarrez-le après l'import pour recharger les traductions.)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { parseTranslations } from './lib/translations.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dbArg = args.includes('--db') ? args[args.indexOf('--db') + 1] : undefined;
const dryRun = args.includes('--dry-run');
if (!file) {
  console.error('Usage : npm run data:import -- <fichier.csv|json> [--db chemin.sqlite] [--dry-run]');
  process.exit(1);
}
const dbPath = path.resolve(dbArg ?? process.env.DATABASE_PATH ?? 'data/isaac-codex.sqlite');
const format = file.toLowerCase().endsWith('.json') ? 'json' : 'csv';
const result = parseTranslations(readFileSync(file, 'utf8'), format);

const db = new Database(dbPath, { fileMustExist: true });
const TABLE: Record<string, [string, string]> = {
  item: ['items', 'id'], trinket: ['trinkets', 'id'], consumable: ['consumables', 'slug'], character: ['characters', 'slug'],
  boss: ['bosses', 'slug'], floor: ['floors', 'slug'], transformation: ['transformations', 'slug'],
};
const unknown: string[] = [];
const rows = result.valid.filter((r) => {
  const [table, col] = TABLE[r.entity_kind]!;
  const exists = db.prepare(`SELECT 1 FROM ${table} WHERE ${col} = ?`).get(col === 'id' ? Number(r.entity_key) : r.entity_key);
  if (!exists) unknown.push(`${r.entity_kind}:${r.entity_key}`);
  return !!exists;
});

console.log(`Lignes valides : ${result.valid.length} · doublons fusionnés : ${result.duplicates} · erreurs : ${result.errors.length} · entités inconnues : ${unknown.length}`);
for (const e of result.errors.slice(0, 20)) console.log(`  ligne ${e.line} : ${e.message}`);
if (unknown.length) console.log(`  inconnues : ${unknown.slice(0, 20).join(', ')}${unknown.length > 20 ? '…' : ''}`);

if (dryRun) {
  console.log('Simulation (--dry-run) : aucune écriture.');
} else {
  const now = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO translations (entity_kind, entity_key, field, lang, value, source, updated_at) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(entity_kind, entity_key, field, lang) DO UPDATE SET value = excluded.value, source = excluded.source, updated_at = excluded.updated_at`,
  );
  db.transaction(() => {
    for (const r of rows) upsert.run(r.entity_kind, r.entity_key, r.field, r.lang, r.value, r.source ?? path.basename(file), now);
  })();
  console.log(`${rows.length} traduction(s) importée(s) dans ${dbPath}. Redémarrez le serveur pour les afficher.`);
}
db.close();
process.exit(result.errors.length ? 2 : 0);
