/** Point d'entrée Vercel (api/index.ts) : démarrage en mémoire et restauration du chemin réécrit (?__path=…). */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import handler from '../../api/index';

let server: Server;
let base: string;
beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.PROFILE_DATABASE_URL;
  process.env.NODE_ENV = 'test';
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('fonction serverless', () => {
  it('sert l\'API depuis un chemin réécrit par Vercel', async () => {
    const r = await fetch(`${base}/api?__path=health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: 'ok', db: 'ok', profilesDb: 'ok', profilesPersistent: false });
  });
  it('conserve la chaîne de requête et les chemins à plusieurs segments', async () => {
    const r = await fetch(`${base}/api?__path=${encodeURIComponent('search')}&q=brimstone&limit=1`);
    expect(((await r.json()) as { results: unknown[] }).results[0]).toMatchObject({ kind: 'item', key: '118' });
    const item = await fetch(`${base}/api?__path=${encodeURIComponent('items/118')}`);
    expect(item.status).toBe(200);
  });
  it('accepte aussi le chemin d\'origine sans réécriture', async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });
  it('crée un profil (base des profils en mémoire sans Turso)', async () => {
    const r = await fetch(`${base}/api?__path=profiles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Vercel', password: 'motdepasse-test' }) });
    expect(r.status).toBe(201);
  });
});
