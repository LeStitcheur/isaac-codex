/**
 * Fonction Vercel : toutes les requêtes /api/* y sont réécrites (voir vercel.json) et confiées à Fastify.
 * La réécriture transmet le chemin d'origine dans ?__path=… ; il est restauré avant le routage.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getServerlessApp } from '../apps/server/src/serverless.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getServerlessApp();
  const url = new URL(req.url ?? '/', 'http://localhost');
  const original = url.searchParams.get('__path');
  if (original !== null) {
    url.searchParams.delete('__path');
    req.url = `/api/${original}${url.search}`;
  }
  app.server.emit('request', req, res);
}
