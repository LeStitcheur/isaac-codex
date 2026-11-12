/**
 * Sauvegardes à chaud de la base SQLite (API backup de SQLite : cohérente même en WAL).
 * Les fichiers sont écrits dans <dossier de la base>/backups et seuls les N plus récents sont conservés.
 */
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { DbHandle } from './client.js';

export function backupDir(databasePath: string) {
  return path.join(path.dirname(databasePath), 'backups');
}

export async function createBackup(handle: DbHandle, databasePath: string, keep: number): Promise<string> {
  const dir = backupDir(databasePath);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = path.join(dir, `isaac-codex-${stamp}.sqlite`);
  await handle.sqlite.backup(file);
  pruneBackups(dir, keep);
  return file;
}

export function pruneBackups(dir: string, keep: number) {
  const files = readdirSync(dir)
    .filter((f) => /^isaac-codex-\d{8}-\d{6}\.sqlite$/.test(f))
    .map((f) => ({ f, t: statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(keep)) unlinkSync(path.join(dir, f));
}

/** Dernière sauvegarde, pour éviter d'en créer une à chaque redémarrage rapproché. */
export function latestBackupAge(databasePath: string): number | null {
  try {
    const dir = backupDir(databasePath);
    const times = readdirSync(dir)
      .filter((f) => f.endsWith('.sqlite'))
      .map((f) => statSync(path.join(dir, f)).mtimeMs);
    return times.length ? Date.now() - Math.max(...times) : null;
  } catch {
    return null;
  }
}
