/**
 * Configuration lue depuis l'environnement.
 * Pterodactyl transmet SERVER_PORT (port attribué) : il est utilisé si PORT n'est pas défini.
 * Aucun port n'est imposé ; 8080 n'est qu'une valeur par défaut pour le développement local.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function findRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        if ((JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string }).name === 'isaac-codex') return dir;
      } catch {
        /* package.json illisible : on continue de remonter */
      }
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const bool = (v: string | undefined, def: boolean) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const rootDir = env.APP_ROOT ? path.resolve(env.APP_ROOT) : findRoot(path.dirname(fileURLToPath(import.meta.url)));
  const portRaw = env.PORT || env.SERVER_PORT || '8080';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`Port invalide : ${portRaw}`);
  const nodeEnv = env.NODE_ENV || 'development';
  const dbPath = env.DATABASE_PATH || 'data/isaac-codex.sqlite';
  return {
    rootDir,
    nodeEnv,
    isProd: nodeEnv === 'production',
    host: env.HOST || '0.0.0.0',
    port,
    databasePath: dbPath === ':memory:' ? dbPath : path.resolve(rootDir, dbPath),
    logLevel: env.LOG_LEVEL || 'info',
    logFormat: (env.LOG_FORMAT || 'pretty') as 'pretty' | 'json',
    appBaseUrl: env.APP_BASE_URL || '',
    trustProxy: bool(env.TRUST_PROXY, true),
    allowProfileCreation: bool(env.ALLOW_PROFILE_CREATION, true),
    backupOnStart: bool(env.BACKUP_ON_START, true),
    backupKeep: Math.max(1, Number(env.BACKUP_KEEP || 7)),
    rateLimitMax: Math.max(10, Number(env.RATE_LIMIT_MAX || 300)),
    /** Créations de profil / connexions / imports autorisés par IP et par tranche de 15 minutes. */
    authRateLimitMax: Math.max(1, Number(env.AUTH_RATE_LIMIT_MAX || 10)),
    spritesDir: path.resolve(rootDir, env.SPRITES_DIR || 'data/sprites'),
    webDir: path.resolve(rootDir, 'dist/web'),
  };
}
export type AppConfig = ReturnType<typeof loadConfig>;
