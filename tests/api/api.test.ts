/** Tests de l'API, des migrations, de la persistance et de la sécurité des profils (base SQLite temporaire). */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../../apps/server/src/config';
import { openDatabase, runMigrations, type DbHandle } from '../../apps/server/src/db/client';
import { datasetPath, loadDatasetFile, seedGameData } from '../../apps/server/src/db/seed';
import { loadGameStore } from '../../apps/server/src/lib/game-store';
import { buildApp } from '../../apps/server/src/app';
import type { Dataset } from '@isaac-codex/shared';

const dir = mkdtempSync(path.join(tmpdir(), 'isaac-codex-test-'));
const dbFile = path.join(dir, 'test.sqlite');
const config = { ...loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_PATH: dbFile, RATE_LIMIT_MAX: '10000', AUTH_RATE_LIMIT_MAX: '1000' }), databasePath: dbFile };
let data: Dataset;

async function start(): Promise<{ app: FastifyInstance; handle: DbHandle }> {
  const handle = openDatabase(dbFile);
  runMigrations(handle, config.rootDir);
  seedGameData(handle, data);
  const store = loadGameStore(handle);
  const app = await buildApp({ config, handle, store: () => store });
  return { app, handle };
}

let app: FastifyInstance;
let handle: DbHandle;
beforeAll(async () => {
  data = loadDatasetFile(datasetPath(config.rootDir));
  ({ app, handle } = await start());
});
afterAll(async () => {
  await app?.close();
  handle?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const createProfile = async (name: string, password?: string) => {
  const r = await app.inject({ method: 'POST', url: '/api/profiles', payload: { name, password } });
  expect(r.statusCode).toBe(201);
  return r.json() as { profile: { id: string }; token: string };
};
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('migrations et import des données', () => {
  it('crée toutes les tables attendues', () => {
    const tables = (handle.sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map((t) => t.name);
    for (const t of ['items', 'item_pool_entries', 'achievements', 'unlock_dependencies', 'completion_marks', 'character_unlocks', 'item_synergies', 'profiles', 'profile_unlocks', 'profile_completion_marks', 'profile_donations', 'translations']) {
      expect(tables).toContain(t);
    }
  });
  it('est idempotent (migrations rejouées, seed ignoré si version identique)', () => {
    runMigrations(handle, config.rootDir);
    expect(seedGameData(handle, data).seeded).toBe(false);
    expect((handle.sqlite.prepare('SELECT COUNT(*) n FROM items').get() as { n: number }).n).toBe(data.items.length);
  });
  it('applique les clés étrangères', () => {
    expect(() => handle.sqlite.prepare("INSERT INTO profile_unlocks (profile_id, achievement_id, status, updated_at) VALUES ('nope', 1, 'unlocked', 'x')").run()).toThrow(/FOREIGN KEY/);
  });
});

describe('API publique', () => {
  it('GET /api/health', async () => {
    const r = await app.inject('/api/health');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ status: 'ok', db: 'ok' });
  });
  it('recherche tolérante aux fautes de frappe', async () => {
    const r = await app.inject('/api/search?q=brimstnoe&limit=3');
    expect(r.json().results[0]).toMatchObject({ kind: 'item', key: '118' });
    const fr = await app.inject(`/api/search?q=${encodeURIComponent('oignon triste')}&limit=1`);
    expect(fr.json().results[0].key).toBe('1');
    const byId = await app.inject('/api/search?q=105&limit=1');
    expect(byId.json().results[0]).toMatchObject({ kind: 'item', key: '105' });
  });
  it('filtre et pagine les objets', async () => {
    const r = await app.inject('/api/items?quality=4&kind=active&pageSize=5');
    const body = r.json();
    expect(body.items.length).toBeLessThanOrEqual(5);
    expect(body.total).toBeGreaterThan(5);
    for (const i of body.items) expect(i).toMatchObject({ quality: 4, kind: 'active' });
    expect((await app.inject('/api/items?quality=9')).statusCode).toBe(400);
  });
  it('fiche objet avec synergies sourcées', async () => {
    const r = await app.inject('/api/items/105');
    const body = r.json();
    expect(body.item.nameEn).toBe('The D6');
    expect(body.synergies.length).toBeGreaterThan(0);
    expect(body.synergies[0].source.page).toContain('wiki.gg');
    expect((await app.inject('/api/items/99999')).statusCode).toBe(404);
  });
  it('fiche personnage avec ses déblocages de marques', async () => {
    const r = await app.inject('/api/characters/the-lost');
    expect(r.json().markUnlocks).toHaveLength(13);
  });
  it('paliers des machines de dons', async () => {
    const r = await app.inject('/api/donations/milestones');
    const body = r.json();
    expect(body.donation.map((m: { coins: number }) => m.coins)).toEqual([10, 20, 50, 100, 150, 200, 400, 600, 900, 999]);
    expect(body.greed.at(-1)).toMatchObject({ coins: 1000, label: 'Keeper' });
  });
  it('comparaison et simulateur', async () => {
    const cmp = await app.inject('/api/synergies/compare?a=item:105&b=item:356');
    expect(cmp.statusCode).toBe(200);
    const build = await app.inject({ method: 'POST', url: '/api/builds/analyze', payload: { items: [{ kind: 'item', key: '1' }] } });
    expect(build.json().stats.additive.tears).toBe(0.7);
  });
  it('renvoie des en-têtes de sécurité', async () => {
    const r = await app.inject('/api/health');
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('profils : sécurité et progression', () => {
  it('refuse l\'accès sans jeton ou avec le jeton d\'un autre profil', async () => {
    const a = await createProfile('Alice');
    const b = await createProfile('Bob');
    expect((await app.inject(`/api/profiles/${a.profile.id}/progress`)).statusCode).toBe(401);
    expect((await app.inject({ url: `/api/profiles/${a.profile.id}/progress`, headers: auth(b.token) })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/profiles/${a.profile.id}/progress`, headers: auth('x'.repeat(43)) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PATCH', url: `/api/profiles/${a.profile.id}/progress`, headers: auth(b.token), payload: { donations: { donation: 5 } } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/profiles/${a.profile.id}`, headers: auth(b.token) })).statusCode).toBe(404);
  });
  it('ne stocke jamais le jeton en clair', async () => {
    const p = await createProfile('Clair');
    const rows = handle.sqlite.prepare('SELECT token_hash FROM profile_tokens WHERE profile_id = ?').all(p.profile.id) as { token_hash: string }[];
    expect(rows[0]!.token_hash).not.toBe(p.token);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('refuse les noms en double et valide les entrées', async () => {
    await createProfile('Unique');
    expect((await app.inject({ method: 'POST', url: '/api/profiles', payload: { name: 'unique' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/api/profiles', payload: { name: '' } })).statusCode).toBe(400);
    const p = await createProfile('Validation');
    const bad = await app.inject({ method: 'PATCH', url: `/api/profiles/${p.profile.id}/progress`, headers: auth(p.token), payload: { marks: [{ characterSlug: 'isaac', markKey: 'nope', difficulty: 'hard' }] } });
    expect(bad.statusCode).toBe(400);
    const unknown = await app.inject({ method: 'PATCH', url: `/api/profiles/${p.profile.id}/progress`, headers: auth(p.token), payload: { unlocks: [{ achievementId: 99999, status: 'unlocked' }] } });
    expect(unknown.statusCode).toBe(400);
  });
  it('enregistre une marque et en déduit le déblocage', async () => {
    const p = await createProfile('Marques');
    const r = await app.inject({
      method: 'PATCH',
      url: `/api/profiles/${p.profile.id}/progress`,
      headers: auth(p.token),
      payload: { marks: [{ characterSlug: 'isaac', markKey: 'lamb', difficulty: 'normal' }], donations: { donation: 120 } },
    });
    expect(r.json().marks.isaac.lamb).toBe('normal');
    const stats = (await app.inject({ url: `/api/profiles/${p.profile.id}/stats`, headers: auth(p.token) })).json();
    const poster = data.achievements.find((a) => a.name === 'Missing Poster')!.id;
    expect(stats.statuses[poster]).toBe('unlocked');
    expect(stats.stats.marks.done).toBe(1);
    const recos = (await app.inject({ url: `/api/profiles/${p.profile.id}/recommendations?limit=5`, headers: auth(p.token) })).json();
    expect(recos.recommendations).toHaveLength(5);
  });
  it('exporte puis réimporte un profil', async () => {
    const p = await createProfile('Export');
    await app.inject({ method: 'PATCH', url: `/api/profiles/${p.profile.id}/progress`, headers: auth(p.token), payload: { marks: [{ characterSlug: 'azazel', markKey: 'satan', difficulty: 'hard' }], favorites: [{ kind: 'item', key: '118', favorite: true }] } });
    const exp = (await app.inject({ method: 'POST', url: `/api/profiles/${p.profile.id}/export`, headers: auth(p.token) })).json();
    expect(exp.format).toBe('isaac-codex-profile');
    expect(JSON.stringify(exp)).not.toContain(p.token);
    const imp = await app.inject({ method: 'POST', url: '/api/profiles/import', payload: { data: exp, mode: 'new' } });
    expect(imp.statusCode).toBe(201);
    const body = imp.json();
    expect(body.profile.name).toBe('Export (2)');
    const prog = (await app.inject({ url: `/api/profiles/${body.profile.id}/progress`, headers: auth(body.token) })).json();
    expect(prog.marks.azazel.satan).toBe('hard');
    expect(prog.favorites).toEqual([{ kind: 'item', key: '118' }]);
    const invalid = await app.inject({ method: 'POST', url: '/api/profiles/import', payload: { data: { ...exp, format: 'x' } } });
    expect(invalid.statusCode).toBe(400);
  });
  it('protège par mot de passe et permet de se reconnecter', async () => {
    await createProfile('Secret', 'motdepasse-solide');
    expect((await app.inject({ method: 'POST', url: '/api/profiles/login', payload: { name: 'Secret', password: 'mauvais-mdp' } })).statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/profiles/login', payload: { name: 'secret', password: 'motdepasse-solide' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).toBeTypeOf('string');
  });
});

describe('persistance', () => {
  it('conserve les données utilisateur après redémarrage', async () => {
    const p = await createProfile('Persistant');
    await app.inject({ method: 'PATCH', url: `/api/profiles/${p.profile.id}/progress`, headers: auth(p.token), payload: { donations: { greed: 640 } } });
    await app.close();
    handle.sqlite.close();
    ({ app, handle } = await start());
    const prog = (await app.inject({ url: `/api/profiles/${p.profile.id}/progress`, headers: auth(p.token) })).json();
    expect(prog.donations.greed).toBe(640);
  });
  it('conserve les profils lors d\'une réimportation forcée des données du jeu', async () => {
    const p = await createProfile('Reseed');
    await app.inject({ method: 'PATCH', url: `/api/profiles/${p.profile.id}/progress`, headers: auth(p.token), payload: { marks: [{ characterSlug: 'eve', markKey: 'hush', difficulty: 'normal' }] } });
    expect(seedGameData(handle, data, { force: true }).seeded).toBe(true);
    const prog = (await app.inject({ url: `/api/profiles/${p.profile.id}/progress`, headers: auth(p.token) })).json();
    expect(prog.marks.eve.hush).toBe('normal');
  });
});
