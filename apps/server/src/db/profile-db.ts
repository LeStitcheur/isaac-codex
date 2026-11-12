/**
 * Base des profils (progression, favoris, jetons…), accédée via libSQL :
 * - Turso (libsql://…) en production serverless (Vercel), où le disque n'est pas persistant ;
 * - le fichier SQLite local (file:…) partout ailleurs, le même que celui des données du jeu.
 * Les données du jeu, en lecture seule, restent servies par better-sqlite3 (voir client.ts).
 */
import { createClient, type Client, type InStatement, type Row } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { pathToFileURL } from 'node:url';
import { migrationsFolder } from './client.js';

export type ProfileDb = Client;
export type { InStatement, Row };

/** Tables enfants des profils : supprimées explicitement (les clés étrangères ne sont pas garanties côté libSQL). */
export const PROFILE_CHILD_TABLES = [
  'profile_unlocks', 'profile_completion_marks', 'profile_favorites', 'profile_donations', 'profile_items',
  'profile_settings', 'profile_history', 'profile_tokens',
] as const;

export interface ProfileDbConfig {
  profileDbUrl: string;
  profileDbAuthToken: string | undefined;
}

/** URL libSQL par défaut : le fichier local de la base, ou une base en mémoire. */
export function defaultProfileDbUrl(databasePath: string): string {
  return databasePath === ':memory:' ? ':memory:' : pathToFileURL(databasePath).href;
}

export function openProfileDb(config: ProfileDbConfig): ProfileDb {
  return createClient({ url: config.profileDbUrl, authToken: config.profileDbAuthToken });
}

export async function migrateProfileDb(client: ProfileDb, rootDir: string): Promise<void> {
  await migrate(drizzle(client), { migrationsFolder: migrationsFolder(rootDir) });
}

export const isRemoteProfileDb = (url: string) => /^(libsql|https?|wss?):/i.test(url);
