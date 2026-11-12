import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;
export interface DbHandle {
  sqlite: Database.Database;
  db: Db;
}

export function openDatabase(file: string): DbHandle {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

/** Dossier des migrations : copié dans dist/server/drizzle au build, sinon apps/server/drizzle. */
export function migrationsFolder(rootDir: string): string {
  const candidates = [path.join(rootDir, 'dist/server/drizzle'), path.join(rootDir, 'apps/server/drizzle')];
  const found = candidates.find((c) => existsSync(path.join(c, 'meta/_journal.json')));
  if (!found) throw new Error(`Migrations introuvables (cherchées dans : ${candidates.join(', ')})`);
  return found;
}

export function runMigrations(handle: DbHandle, rootDir: string): void {
  migrate(handle.db, { migrationsFolder: migrationsFolder(rootDir) });
}
