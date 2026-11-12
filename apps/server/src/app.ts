/** Assemblage de l'application Fastify : sécurité HTTP, limitation de débit, API, frontend compilé. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { LogController, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import type { AppConfig } from './config.js';
import type { DbHandle } from './db/client.js';
import type { ProfileDb } from './db/profile-db.js';
import type { GameStore } from './lib/game-store.js';
import { registerErrorHandler } from './lib/errors.js';
import { gameRoutes } from './routes/game.js';
import { profileRoutes } from './routes/profiles.js';
import { toolRoutes } from './routes/tools.js';

export interface AppContext {
  config: AppConfig;
  /** Données du jeu (lecture seule, better-sqlite3). */
  handle: DbHandle;
  /** Profils (libSQL : Turso ou fichier local). */
  profiles: ProfileDb;
  /** Vrai si les profils ne survivent pas au redémarrage (base en mémoire). */
  profilesEphemeral?: boolean;
  store: () => GameStore;
}

export function loggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  if (config.nodeEnv === 'test') return false;
  const base = {
    level: config.logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  };
  if (config.logFormat === 'json') return base;
  return { ...base, transport: { target: 'pino-pretty', options: { translateTime: 'SYS:yyyy-mm-dd HH:MM:ss', ignore: 'pid,hostname,reqId', singleLine: true } } };
}

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const { config } = ctx;
  const app = Fastify({
    logger: loggerOptions(config),
    trustProxy: config.trustProxy,
    bodyLimit: 1_000_000,
    // Journal des requêtes uniquement en niveau debug/trace : les logs de production restent lisibles.
    logController: new LogController({ disableRequestLogging: !['debug', 'trace'].includes(config.logLevel) }),
  });

  registerErrorHandler(app);

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // HSTS est laissé au reverse proxy HTTPS (le serveur Node écoute en HTTP derrière lui).
    hsts: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(compress, { global: true, threshold: 1024 });
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/api/health',
  });

  await app.register(async (api) => {
    await gameRoutes(api, ctx);
    await profileRoutes(api, ctx);
    await toolRoutes(api, ctx);
  });

  if (existsSync(config.spritesDir)) {
    await app.register(fastifyStatic, { root: config.spritesDir, prefix: '/sprites/', decorateReply: false, maxAge: '7d', index: false });
  }

  const indexHtml = path.join(config.webDir, 'index.html');
  if (existsSync(indexHtml)) {
    await app.register(fastifyStatic, {
      root: config.webDir,
      prefix: '/',
      // Résolution à la volée : un nouveau build est servi sans redémarrage.
      wildcard: true,
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    });
  }

  if (existsSync(indexHtml)) {
    app.get('/', (_req, reply) => {
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html', config.webDir);
    });
  }

  app.setNotFoundHandler((req, reply) => {
    const isFile = /\.[a-z0-9]{2,5}$/i.test(req.url.split('?')[0] ?? '');
    if (req.url.startsWith('/api/') || isFile || (req.method !== 'GET' && req.method !== 'HEAD') || !existsSync(indexHtml)) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Route introuvable' });
    }
    // Application monopage : toute autre URL renvoie index.html.
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html', config.webDir);
  });

  return app;
}
