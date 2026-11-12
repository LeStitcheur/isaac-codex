/**
 * Point d'entrée : migrations → import des données (si nouvelle version) → sauvegarde → serveur HTTP.
 * Options :
 *   --migrate-only  applique les migrations et importe les données puis s'arrête
 *   --backup        crée une sauvegarde de la base puis s'arrête
 *   --reseed        force la réimportation des données du jeu (les profils ne sont pas touchés)
 */
import { loadConfig } from './config.js';
import { openDatabase, runMigrations } from './db/client.js';
import { datasetPath, loadDatasetFile, seedGameData, currentDatasetVersion } from './db/seed.js';
import { createBackup, latestBackupAge } from './db/backup.js';
import { isRemoteProfileDb, migrateProfileDb, openProfileDb } from './db/profile-db.js';
import { loadGameStore, type GameStore } from './lib/game-store.js';
import { buildApp } from './app.js';

const args = new Set(process.argv.slice(2));
const log = (msg: string) => console.log(`[isaac-codex] ${msg}`);

async function main() {
  const config = loadConfig();
  log(`Démarrage (${config.nodeEnv}) — base : ${config.databasePath}`);
  const handle = openDatabase(config.databasePath);

  if (args.has('--backup')) {
    const file = await createBackup(handle, config.databasePath, config.backupKeep);
    log(`Sauvegarde créée : ${file}`);
    handle.sqlite.close();
    return;
  }

  runMigrations(handle, config.rootDir);
  log('Migrations appliquées');

  const hadData = currentDatasetVersion(handle) !== null;
  if (config.backupOnStart && hadData && config.databasePath !== ':memory:') {
    const age = latestBackupAge(config.databasePath);
    if (age === null || age > 12 * 3600_000) log(`Sauvegarde automatique : ${await createBackup(handle, config.databasePath, config.backupKeep)}`);
  }

  const data = loadDatasetFile(datasetPath(config.rootDir));
  const seed = seedGameData(handle, data, { force: args.has('--reseed') });
  log(seed.seeded ? `Données du jeu importées (version ${seed.version})` : `Données du jeu à jour (version ${seed.version})`);

  if (args.has('--migrate-only')) {
    handle.sqlite.close();
    return;
  }

  const profiles = openProfileDb(config);
  await migrateProfileDb(profiles, config.rootDir);
  log(`Base des profils : ${isRemoteProfileDb(config.profileDbUrl) ? 'libSQL distante (Turso)' : 'fichier local'}`);

  let store: GameStore = loadGameStore(handle);
  const app = await buildApp({ config, handle, profiles, profilesEphemeral: config.profileDbUrl === ':memory:', store: () => store });
  void (store = loadGameStore(handle));

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    log(`Signal ${signal} reçu : arrêt propre…`);
    try {
      await app.close();
      profiles.close();
      handle.sqlite.pragma('wal_checkpoint(TRUNCATE)');
      handle.sqlite.close();
      log('Arrêt terminé.');
      process.exit(0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
  log(`Isaac Codex listening on http://${config.host}:${config.port}${config.appBaseUrl ? ` (URL publique : ${config.appBaseUrl})` : ''}`);
}

main().catch((e) => {
  console.error('[isaac-codex] Échec du démarrage :', e instanceof Error ? e.message : e);
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(1);
});
