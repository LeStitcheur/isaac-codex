/** Outils : simulateur de build, comparaison d'objets, santé, sprites fournis par l'utilisateur. */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { VERSIONS, analyzeBuild, entityRef, versionBit, type VersionKey } from '../../../../packages/shared/src/index.js';
import type { AppContext } from '../app.js';
import { badRequest, parse } from '../lib/errors.js';

const versionKeys = VERSIONS.map((v) => v.key) as [VersionKey, ...VersionKey[]];
const startedAt = Date.now();

export async function toolRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/health', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
    let db = 'ok';
    try {
      ctx.handle.sqlite.prepare('SELECT 1').get();
    } catch {
      db = 'error';
    }
    let profilesDb = 'ok';
    try {
      await ctx.profiles.execute('SELECT 1');
    } catch {
      profilesDb = 'error';
    }
    if (db !== 'ok' || profilesDb !== 'ok') reply.status(503);
    const store = ctx.store();
    return {
      status: db === 'ok' && profilesDb === 'ok' ? 'ok' : 'degraded',
      profilesDb,
      profilesPersistent: !ctx.profilesEphemeral,
      app: 'isaac-codex',
      version: process.env.npm_package_version ?? '1.0.0',
      datasetVersion: store.meta.datasetVersion,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      db,
      node: process.version,
    };
  });

  app.post('/api/builds/analyze', async (req) => {
    const body = parse(
      z.object({
        items: z.array(entityRef).max(80),
        version: z.enum(versionKeys).default('repentance'),
      }),
      req.body,
    );
    const store = ctx.store();
    for (const r of body.items) {
      if (r.kind !== 'item' && r.kind !== 'trinket') throw badRequest('Seuls les objets et trinkets sont acceptés');
      if (!store.label(r).exists) throw badRequest(`Référence inconnue : ${r.kind}:${r.key}`);
    }
    const analysis = analyzeBuild(body.items, store, versionBit(body.version));
    const lab = (r: { kind: string; key: string }) => store.label(r as never);
    return {
      ...analysis,
      synergies: analysis.synergies.map((s) => ({ ...s, aLabel: lab(s.a), bLabel: lab(s.b) })),
      interactions: analysis.interactions.map((s) => ({ ...s, aLabel: lab(s.a), bLabel: lab(s.b) })),
      transformations: analysis.transformations.map((t) => ({ ...t, missingLabels: t.missing.map(lab), haveLabels: t.have.map(lab) })),
      suggestions: analysis.suggestions.map((s) => ({ ...s, label: lab(s.ref) })),
      disclaimer:
        "Synergies et interactions issues exclusivement des pages du wiki. Les statistiques sont un cumul indicatif des modificateurs simples décrits : le moteur du jeu (plafonds, formules de cadence, effets conditionnels) n'est pas simulé.",
    };
  });

  app.get('/api/synergies/compare', async (req) => {
    const q = parse(z.object({ a: z.string().regex(/^(item|trinket|consumable):[A-Za-z0-9-]+$/), b: z.string().regex(/^(item|trinket|consumable):[A-Za-z0-9-]+$/) }), req.query);
    const store = ctx.store();
    const [ak, aKey] = q.a.split(':') as [string, string];
    const [bk, bKey] = q.b.split(':') as [string, string];
    const a = store.label({ kind: ak as 'item', key: aKey });
    const b = store.label({ kind: bk as 'item', key: bKey });
    if (!a.exists || !b.exists) throw badRequest('Référence inconnue');
    const between = (store.synergiesByRef.get(q.a) ?? []).filter(
      (s) => (`${s.a.kind}:${s.a.key}` === q.a && `${s.b.kind}:${s.b.key}` === q.b) || (`${s.a.kind}:${s.a.key}` === q.b && `${s.b.kind}:${s.b.key}` === q.a),
    );
    const entity = (kind: string, key: string) =>
      kind === 'item' ? store.byId.item.get(key) : kind === 'trinket' ? store.byId.trinket.get(key) : store.byId.consumable.get(key);
    const sharedTransformations = store.transformations.filter(
      (t) => t.members.some((m) => `${m.kind}:${m.key}` === q.a) && t.members.some((m) => `${m.kind}:${m.key}` === q.b),
    );
    return {
      a: { ref: a, entity: entity(ak, aKey) },
      b: { ref: b, entity: entity(bk, bKey) },
      documented: between,
      sharedTransformations: sharedTransformations.map((t) => ({ slug: t.slug, nameEn: t.nameEn, nameFr: t.nameFr })),
      note: between.length ? null : "Aucune interaction documentée entre ces deux éléments dans la source : cela ne signifie pas qu'il n'en existe aucune.",
    };
  });

  /** Sprites fournis par l'utilisateur (data/sprites/{items,trinkets,characters,...}/<clé>.png). */
  app.get('/api/sprites/manifest', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=60');
    const dir = ctx.config.spritesDir;
    const manifest: Record<string, string[]> = {};
    if (existsSync(dir)) {
      for (const group of ['items', 'trinkets', 'consumables', 'characters', 'bosses']) {
        const g = path.join(dir, group);
        if (!existsSync(g)) continue;
        manifest[group] = readdirSync(g).filter((f) => /^[A-Za-z0-9-]+\.(png|webp|gif)$/.test(f));
      }
    }
    return manifest;
  });
}
