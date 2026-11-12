/**
 * Démarrage en environnement serverless (Vercel).
 * - Données du jeu : base SQLite EN MÉMOIRE, importée depuis dataset.json à chaque démarrage à froid
 *   (le disque des fonctions n'est ni persistant ni partagé).
 * - Profils : base libSQL distante (Turso, variables TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).
 *   Sans elle, les profils sont gardés en mémoire et perdus au prochain démarrage à froid.
 * L'application Fastify est construite une seule fois par instance puis réutilisée.
 */
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase, runMigrations } from './db/client.js';
import { isRemoteProfileDb, migrateProfileDb, openProfileDb } from './db/profile-db.js';
import { datasetPath, loadDatasetFile, seedGameData } from './db/seed.js';
import { loadGameStore } from './lib/game-store.js';

let appPromise: Promise<FastifyInstance> | null = null;

async function create(): Promise<FastifyInstance> {
  const started = Date.now();
  const config = loadConfig({
    LOG_FORMAT: 'json', // pino-pretty utilise un worker thread : à éviter en serverless
    ...process.env,
    APP_ROOT: process.env.APP_ROOT || process.cwd(),
    DATABASE_PATH: ':memory:',
    BACKUP_ON_START: 'false',
  });

  const handle = openDatabase(':memory:');
  runMigrations(handle, config.rootDir);
  seedGameData(handle, loadDatasetFile(datasetPath(config.rootDir)));
  const store = loadGameStore(handle);

  const remote = isRemoteProfileDb(config.profileDbUrl);
  if (!remote) console.warn('[isaac-codex] TURSO_DATABASE_URL absent : les profils ne seront PAS conservés entre deux démarrages.');
  const profiles = openProfileDb(config);
  await migrateProfileDb(profiles, config.rootDir);

  const app = await buildApp({ config, handle, profiles, profilesEphemeral: !remote, store: () => store });
  await app.ready();
  console.log(`[isaac-codex] Prêt en ${Date.now() - started} ms (profils : ${remote ? 'Turso' : 'mémoire'})`);
  return app;
}

/** Application prête à l'emploi (construite au premier appel ; un échec est retenté à l'appel suivant). */
export function getServerlessApp(): Promise<FastifyInstance> {
  appPromise ??= create().catch((e) => {
    appPromise = null;
    throw e;
  });
  return appPromise;
}
