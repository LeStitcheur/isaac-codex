/** Routes publiques de consultation des données du jeu. */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  VERSIONS, computeStatuses, markupToText, versionBit, type Achievement, type Character, type EntityRef, type Item,
  type Synergy, type VersionKey,
} from '@isaac-codex/shared';
import type { AppContext } from '../app.js';
import type { GameStore } from '../lib/game-store.js';
import { notFound, parse } from '../lib/errors.js';
import { optionalProfileId } from '../lib/auth.js';
import { loadProgress } from './profiles.js';

const versionKeys = VERSIONS.map((v) => v.key) as [VersionKey, ...VersionKey[]];
const pageQuery = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(48),
};
const csv = <T extends z.ZodTypeAny>(inner: T) =>
  z
    .string()
    .max(500)
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(inner).max(50))
    .optional();
const yesNo = z.enum(['yes', 'no']).optional();

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^(the|le|la|les|l')\s*/, '').replace(/\s+/g, ' ').trim();

/** Distance de Damerau-Levenshtein (transpositions adjacentes comptées comme une seule faute). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

const KIND_PENALTY: Record<string, number> = { achievement: 0.12, guide: 0.05, transformation: 0.02 };

/** Recherche floue : candidats Fuse, puis reclassement par distance d'édition sur les noms (tolérance aux fautes de frappe). */
export function rankSearch(s: GameStore, query: string, limit: number) {
  const q = normalize(query);
  return s.search
    .search(query, { limit: Math.max(60, limit) })
    .map((r) => {
      const names = [r.item.nameEn, r.item.nameFr, r.item.title].filter(Boolean).map(normalize);
      const lev = Math.min(...names.map((n) => editDistance(q, n.slice(0, Math.max(q.length, n.length))) / Math.max(q.length, n.length, 1)));
      const prefix = names.some((n) => n === q) ? -0.2 : names.some((n) => n.startsWith(q)) ? -0.1 : 0;
      return { item: r.item, score: Math.max(0, Math.min(r.score ?? 1, lev) + prefix + (KIND_PENALTY[r.item.kind] ?? 0)) };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

export function paginate<T>(list: T[], page: number, pageSize: number) {
  const total = list.length;
  return { items: list.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

const cacheable = (reply: FastifyReply, version: string) => {
  reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  reply.header('X-Dataset-Version', version);
};

export function itemSummary(i: Item) {
  return {
    id: i.id, slug: i.slug, kind: i.kind, familiar: i.familiar, nameEn: i.nameEn, nameFr: i.nameFr, quote: i.quote,
    quality: i.quality, qualityRepPlus: i.qualityRepPlus, mask: i.mask, unlockAchievementId: i.unlockAchievementId,
    pools: [...new Set(i.pools.map((p) => p.pool))], transformations: i.transformations, tags: i.tags,
    description: i.description,
  };
}
export function characterSummary(c: Character) {
  return {
    slug: c.slug, nameEn: c.nameEn, nameFr: c.nameFr, tainted: c.tainted, baseSlug: c.baseSlug, order: c.order, health: c.health,
    unlockAchievementId: c.unlockAchievementId, mask: c.mask, difficulty: c.editorial?.difficulty ?? null, startingItems: c.startingItems,
  };
}

export async function gameRoutes(app: FastifyInstance, ctx: AppContext) {
  const store = () => ctx.store();

  /** Résout des références pour l'affichage (nom, existence). */
  const labels = (refs: EntityRef[]) => refs.map((r) => store().label(r));
  const synergyView = (s: Synergy, self: EntityRef) => {
    const other = s.a.kind === self.kind && s.a.key === self.key ? s.b : s.a;
    return { ...s, direction: other === s.b ? 'out' : 'in', other: store().label(other) };
  };
  const synergiesFor = (ref: EntityRef, versionMask?: number) =>
    (store().synergiesByRef.get(`${ref.kind}:${ref.key}`) ?? [])
      .filter((s) => versionMask === undefined || s.mask === null || (s.mask & versionMask) !== 0)
      .map((s) => synergyView(s, ref));

  app.get('/api/meta', async (_req, reply) => {
    const s = store();
    cacheable(reply, s.meta.datasetVersion);
    return {
      meta: s.meta,
      versions: VERSIONS,
      completionMarks: s.completionMarks,
      pools: s.pools,
      transformations: s.transformations.map((t) => ({ slug: t.slug, nameEn: t.nameEn, nameFr: t.nameFr, mask: t.mask })),
      tags: [...new Set(s.items.flatMap((i) => i.tags))].sort(),
      characters: s.characters.map(characterSummary),
      markUnlocks: s.markUnlocks,
      donationMilestones: s.donationMilestones,
      plannerPaths: s.plannerPaths,
      floors: s.floors.map((f) => ({ slug: f.slug, nameEn: f.nameEn, nameFr: f.nameFr, chapter: f.chapter, alternate: f.alternate, mask: f.mask })),
      disclaimer:
        "Isaac Codex est un wiki communautaire non officiel, sans affiliation avec Edmund McMillen, Nicalis ou les détenteurs des droits de The Binding of Isaac.",
    };
  });

  /* ------------------------------- Personnages ------------------------------- */
  app.get('/api/characters', async (req, reply) => {
    const q = parse(z.object({ tainted: yesNo, version: z.enum(versionKeys).optional() }), req.query);
    let list = store().characters;
    if (q.tainted) list = list.filter((c) => c.tainted === (q.tainted === 'yes'));
    if (q.version) list = list.filter((c) => c.mask & versionBit(q.version!));
    cacheable(reply, store().meta.datasetVersion);
    return { items: list.map(characterSummary), total: list.length };
  });

  app.get('/api/characters/:slug', async (req, reply) => {
    const { slug } = parse(z.object({ slug: z.string().max(64) }), req.params);
    const s = store();
    const c = s.byId.character.get(slug);
    if (!c) throw notFound('Personnage');
    const markUnlocks = s.markUnlocks
      .filter((m) => m.characterSlug === slug)
      .map((m) => ({ ...m, achievement: s.byId.achievement.get(m.achievementId) }));
    const related = s.achievements.filter((a) => a.characterSlug === slug && !markUnlocks.some((m) => m.achievementId === a.id));
    const tainted = s.characters.find((x) => x.baseSlug === slug) ?? null;
    cacheable(reply, s.meta.datasetVersion);
    return {
      character: c,
      startingItems: labels(c.startingItems),
      unlockAchievement: c.unlockAchievementId ? s.byId.achievement.get(c.unlockAchievementId) ?? null : null,
      markUnlocks,
      otherAchievements: related,
      base: c.baseSlug ? characterSummary(s.byId.character.get(c.baseSlug)!) : null,
      tainted: tainted ? characterSummary(tainted) : null,
      completionMarks: s.completionMarks,
    };
  });

  /* --------------------------------- Objets --------------------------------- */
  const itemQuery = z.object({
    q: z.string().trim().max(80).optional(),
    kind: z.enum(['active', 'passive', 'familiar']).optional(),
    quality: csv(z.coerce.number().int().min(0).max(4)),
    pool: z.string().max(60).optional(),
    version: z.enum(versionKeys).optional(),
    transformation: z.string().max(60).optional(),
    tag: z.string().max(40).optional(),
    unlocked: yesNo,
    favorites: yesNo,
    sort: z.enum(['id', 'name', 'quality']).default('id'),
    ...pageQuery,
  });

  app.get('/api/items', async (req, reply) => {
    const q = parse(itemQuery, req.query);
    const s = store();
    let list = s.items;
    if (q.q) {
      const exact = /^\d+$/.test(q.q) ? s.byId.item.get(q.q) : undefined;
      const fuzzy = rankSearch(s, q.q, 200)
        .filter((r) => r.item.kind === 'item')
        .map((r) => s.byId.item.get(r.item.key)!)
        .filter(Boolean);
      list = exact ? [exact, ...fuzzy.filter((i) => i.id !== exact.id)] : fuzzy;
    }
    if (q.kind === 'familiar') list = list.filter((i) => i.familiar);
    else if (q.kind) list = list.filter((i) => i.kind === q.kind);
    if (q.quality?.length) list = list.filter((i) => i.quality !== null && q.quality!.includes(i.quality));
    if (q.pool) list = list.filter((i) => i.pools.some((p) => p.pool === q.pool));
    if (q.version) list = list.filter((i) => i.mask & versionBit(q.version!));
    if (q.transformation) list = list.filter((i) => i.transformations.includes(q.transformation!));
    if (q.tag) list = list.filter((i) => i.tags.includes(q.tag!));
    if (q.unlocked || q.favorites) {
      const profileId = optionalProfileId(ctx.handle, req);
      if (profileId) {
        const progress = loadProgress(ctx.handle, profileId);
        if (q.favorites === 'yes') {
          const fav = new Set(progress.favorites.filter((f) => f.kind === 'item').map((f) => f.key));
          list = list.filter((i) => fav.has(String(i.id)));
        }
        if (q.unlocked) {
          const statuses = computeStatuses(s, progress, versionBit(progress.settings.gameVersion as VersionKey));
          const isUnlocked = (i: Item) => i.unlockAchievementId === null || statuses.get(i.unlockAchievementId) === 'unlocked';
          list = list.filter((i) => isUnlocked(i) === (q.unlocked === 'yes'));
        }
      }
    }
    if (!q.q) {
      if (q.sort === 'name') list = [...list].sort((a, b) => (a.nameFr ?? a.nameEn).localeCompare(b.nameFr ?? b.nameEn, 'fr'));
      if (q.sort === 'quality') list = [...list].sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1) || a.id - b.id);
    }
    cacheable(reply, s.meta.datasetVersion);
    if (q.unlocked || q.favorites) reply.header('Cache-Control', 'private, no-store');
    const page = paginate(list, q.page, q.pageSize);
    return { ...page, items: page.items.map(itemSummary) };
  });

  /** Index compact de tous les objets et trinkets (sélecteurs, simulateur, filtres instantanés). */
  app.get('/api/items/index', async (_req, reply) => {
    const s = store();
    cacheable(reply, s.meta.datasetVersion);
    return {
      items: s.items.map((i) => ({ id: i.id, nameEn: i.nameEn, nameFr: i.nameFr, quality: i.quality, kind: i.kind, familiar: i.familiar, mask: i.mask, unlockAchievementId: i.unlockAchievementId })),
      trinkets: s.trinkets.map((t) => ({ id: t.id, nameEn: t.nameEn, nameFr: t.nameFr, mask: t.mask, unlockAchievementId: t.unlockAchievementId })),
    };
  });

  app.get('/api/items/:id', async (req, reply) => {
    const { id } = parse(z.object({ id: z.coerce.number().int().positive() }), req.params);
    const s = store();
    const item = s.byId.item.get(String(id));
    if (!item) throw notFound('Objet');
    const ref: EntityRef = { kind: 'item', key: String(id) };
    cacheable(reply, s.meta.datasetVersion);
    return {
      item,
      pools: item.pools.map((p) => ({ ...p, pool: s.pools.find((x) => x.key === p.pool) ?? { key: p.pool, nameEn: p.pool, nameFr: null, greed: false, mask: p.mask } })),
      unlockAchievement: item.unlockAchievementId ? s.byId.achievement.get(item.unlockAchievementId) ?? null : null,
      transformations: item.transformations.map((t) => s.byId.transformation.get(t)).filter(Boolean),
      startingFor: s.characters.filter((c) => c.startingItems.some((x) => x.kind === 'item' && x.key === String(id))).map(characterSummary),
      synergies: synergiesFor(ref),
      neighbors: { prev: s.byId.item.has(String(id - 1)) ? id - 1 : null, next: s.byId.item.has(String(id + 1)) ? id + 1 : null },
    };
  });

  app.get('/api/items/:id/synergies', async (req, reply) => {
    const { id } = parse(z.object({ id: z.coerce.number().int().positive() }), req.params);
    const { version } = parse(z.object({ version: z.enum(versionKeys).optional() }), req.query);
    if (!store().byId.item.has(String(id))) throw notFound('Objet');
    cacheable(reply, store().meta.datasetVersion);
    const list = synergiesFor({ kind: 'item', key: String(id) }, version ? versionBit(version) : undefined);
    return { synergies: list.filter((s) => s.section === 'synergy'), interactions: list.filter((s) => s.section === 'interaction') };
  });

  /* -------------------------------- Trinkets -------------------------------- */
  app.get('/api/trinkets', async (req, reply) => {
    const q = parse(z.object({ q: z.string().trim().max(80).optional(), version: z.enum(versionKeys).optional(), ...pageQuery }), req.query);
    const s = store();
    let list = s.trinkets;
    if (q.q) list = rankSearch(s, q.q, 200).filter((r) => r.item.kind === 'trinket').map((r) => s.byId.trinket.get(r.item.key)!);
    if (q.version) list = list.filter((t) => t.mask & versionBit(q.version!));
    cacheable(reply, s.meta.datasetVersion);
    return paginate(list, q.page, q.pageSize);
  });

  app.get('/api/trinkets/:id', async (req, reply) => {
    const { id } = parse(z.object({ id: z.coerce.number().int().positive() }), req.params);
    const s = store();
    const t = s.byId.trinket.get(String(id));
    if (!t) throw notFound('Trinket');
    cacheable(reply, s.meta.datasetVersion);
    return {
      trinket: t,
      unlockAchievement: t.unlockAchievementId ? s.byId.achievement.get(t.unlockAchievementId) ?? null : null,
      synergies: synergiesFor({ kind: 'trinket', key: String(id) }),
      startingFor: s.characters.filter((c) => c.startingItems.some((x) => x.kind === 'trinket' && x.key === String(id))).map(characterSummary),
    };
  });

  /* ------------------------------ Consommables ------------------------------ */
  app.get('/api/consumables', async (req, reply) => {
    const q = parse(
      z.object({ q: z.string().trim().max(80).optional(), kind: z.enum(['card', 'special card', 'rune', 'soul stone', 'pill', 'other']).optional(), ...pageQuery }),
      req.query,
    );
    const s = store();
    let list = s.consumables;
    if (q.q) list = rankSearch(s, q.q, 200).filter((r) => r.item.kind === 'consumable').map((r) => s.byId.consumable.get(r.item.key)!);
    if (q.kind) list = list.filter((c) => c.kind === q.kind);
    cacheable(reply, s.meta.datasetVersion);
    return paginate(list, q.page, q.pageSize);
  });

  app.get('/api/consumables/:slug', async (req, reply) => {
    const { slug } = parse(z.object({ slug: z.string().max(80) }), req.params);
    const s = store();
    const c = s.byId.consumable.get(slug);
    if (!c) throw notFound('Consommable');
    cacheable(reply, s.meta.datasetVersion);
    return {
      consumable: c,
      unlockAchievement: c.unlockAchievementId ? s.byId.achievement.get(c.unlockAchievementId) ?? null : null,
      synergies: synergiesFor({ kind: 'consumable', key: slug }),
    };
  });

  /* ---------------------------- Succès (unlocks) ---------------------------- */
  app.get('/api/unlocks', async (req, reply) => {
    const q = parse(
      z.object({
        q: z.string().trim().max(80).optional(),
        kind: z.enum(['mark', 'allMarks', 'donation', 'greedDonation', 'challenge', 'other']).optional(),
        reward: z.enum(['item', 'trinket', 'consumable', 'character', 'floor', 'baby', 'challenge', 'other']).optional(),
        character: z.string().max(64).optional(),
        version: z.enum(versionKeys).optional(),
        page: pageQuery.page,
        pageSize: z.coerce.number().int().min(1).max(1000).default(100),
      }),
      req.query,
    );
    const s = store();
    let list: Achievement[] = s.achievements;
    if (q.q) {
      const ids = new Set(s.search.search(q.q, { limit: 300 }).filter((r) => r.item.kind === 'achievement').map((r) => Number(r.item.key)));
      const needle = q.q.toLowerCase();
      list = list.filter((a) => ids.has(a.id) || a.requirementText.toLowerCase().includes(needle));
    }
    if (q.kind) list = list.filter((a) => a.kind === q.kind);
    if (q.reward) list = list.filter((a) => a.reward.kind === q.reward);
    if (q.character) list = list.filter((a) => a.characterSlug === q.character);
    if (q.version) list = list.filter((a) => a.mask & versionBit(q.version!));
    cacheable(reply, s.meta.datasetVersion);
    return paginate(list, q.page, q.pageSize);
  });

  app.get('/api/unlocks/:id', async (req, reply) => {
    const { id } = parse(z.object({ id: z.coerce.number().int().positive() }), req.params);
    const s = store();
    const a = s.byId.achievement.get(id);
    if (!a) throw notFound('Succès');
    cacheable(reply, s.meta.datasetVersion);
    return {
      achievement: a,
      prerequisites: a.prerequisites.map((p) => s.byId.achievement.get(p)).filter(Boolean),
      unlocks: s.achievements.filter((x) => x.prerequisites.includes(id)),
      markUnlock: s.markUnlocks.find((m) => m.achievementId === id) ?? null,
      reward: a.reward.key ? store().label({ kind: a.reward.kind === 'character' ? 'character' : a.reward.kind === 'floor' ? 'floor' : (a.reward.kind as EntityRef['kind']), key: a.reward.key }) : null,
    };
  });

  /* ----------------------------- Boss & étages ----------------------------- */
  app.get('/api/bosses', async (req, reply) => {
    const q = parse(z.object({ q: z.string().trim().max(80).optional(), type: z.enum(['boss', 'mini-boss']).optional(), floor: z.string().max(60).optional() }), req.query);
    const s = store();
    let list = s.bosses;
    if (q.q) list = rankSearch(s, q.q, 200).filter((r) => r.item.kind === 'boss').map((r) => s.byId.boss.get(r.item.key)!);
    if (q.type) list = list.filter((b) => b.type === q.type);
    if (q.floor) list = list.filter((b) => b.floors.includes(q.floor!));
    cacheable(reply, s.meta.datasetVersion);
    return {
      items: list.map((b) => ({ slug: b.slug, nameEn: b.nameEn, nameFr: b.nameFr, type: b.type, hp: b.hp, floors: b.floors, mask: b.mask })),
      total: list.length,
    };
  });

  app.get('/api/bosses/:slug', async (req, reply) => {
    const { slug } = parse(z.object({ slug: z.string().max(80) }), req.params);
    const s = store();
    const b = s.byId.boss.get(slug);
    if (!b) throw notFound('Boss');
    cacheable(reply, s.meta.datasetVersion);
    return {
      boss: b,
      floors: b.floors.map((f) => s.byId.floor.get(f)).filter(Boolean),
      marks: s.completionMarks.filter((m) => m.boss.toLowerCase() === b.nameEn.toLowerCase()),
      achievements: s.achievements.filter((a) => a.requirement.includes(`⟦e:${slug}¦`)).slice(0, 60),
    };
  });

  app.get('/api/floors', async (_req, reply) => {
    const s = store();
    cacheable(reply, s.meta.datasetVersion);
    return { items: s.floors, routes: s.routes };
  });

  app.get('/api/floors/:slug', async (req, reply) => {
    const { slug } = parse(z.object({ slug: z.string().max(80) }), req.params);
    const s = store();
    const f = s.byId.floor.get(slug);
    if (!f) throw notFound('Étage');
    cacheable(reply, s.meta.datasetVersion);
    return {
      floor: f,
      bosses: f.bosses.map((b) => s.byId.boss.get(b) ?? { slug: b, nameEn: b, nameFr: null }),
      unlockAchievement: f.unlockAchievementId ? s.byId.achievement.get(f.unlockAchievementId) ?? null : null,
      routes: s.routes.filter((r) => r.stages.some((st) => st.floors.includes(slug))),
    };
  });

  app.get('/api/routes', async (_req, reply) => {
    cacheable(reply, store().meta.datasetVersion);
    return { items: store().routes };
  });

  /* ------------------------- Guides, transformations ------------------------- */
  app.get('/api/guides', async (req, reply) => {
    const q = parse(z.object({ category: z.string().max(40).optional(), level: z.enum(['debutant', 'intermediaire', 'expert']).optional() }), req.query);
    let list = store().guides;
    if (q.category) list = list.filter((g) => g.category === q.category);
    if (q.level) list = list.filter((g) => g.level === q.level);
    cacheable(reply, store().meta.datasetVersion);
    return { items: list.map(({ steps, ...g }) => ({ ...g, stepCount: steps.length })) };
  });

  app.get('/api/guides/:slug', async (req, reply) => {
    const { slug } = parse(z.object({ slug: z.string().max(80) }), req.params);
    const s = store();
    const g = s.byId.guide.get(slug);
    if (!g) throw notFound('Guide');
    cacheable(reply, s.meta.datasetVersion);
    return {
      guide: g,
      related: labels(g.related),
      achievements: g.achievementIds.map((id) => s.byId.achievement.get(id)).filter(Boolean),
    };
  });

  app.get('/api/transformations', async (_req, reply) => {
    const s = store();
    cacheable(reply, s.meta.datasetVersion);
    return { items: s.transformations.map((t) => ({ ...t, membersLabels: labels(t.members) })) };
  });

  app.get('/api/challenges', async (_req, reply) => {
    cacheable(reply, store().meta.datasetVersion);
    return { items: store().challenges };
  });

  app.get('/api/donations/milestones', async (_req, reply) => {
    const s = store();
    cacheable(reply, s.meta.datasetVersion);
    const withAch = s.donationMilestones.map((m) => ({ ...m, achievement: s.byId.achievement.get(m.achievementId) ?? null }));
    return { donation: withAch.filter((m) => m.machine === 'donation'), greed: withAch.filter((m) => m.machine === 'greed') };
  });

  app.get('/api/planner/paths', async (_req, reply) => {
    cacheable(reply, store().meta.datasetVersion);
    return { items: store().plannerPaths };
  });

  app.get('/api/tips/random', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const tips = store().tips;
    return tips[Math.floor(Math.random() * tips.length)] ?? null;
  });

  app.get('/api/random/item', async (req, reply) => {
    const { version } = parse(z.object({ version: z.enum(versionKeys).optional() }), req.query);
    reply.header('Cache-Control', 'no-store');
    const list = version ? store().items.filter((i) => i.mask & versionBit(version)) : store().items;
    const item = list[Math.floor(Math.random() * list.length)]!;
    return { id: item.id, nameEn: item.nameEn, nameFr: item.nameFr };
  });

  /* --------------------------------- Recherche --------------------------------- */
  app.get('/api/search', async (req) => {
    const q = parse(
      z.object({
        q: z.string().trim().min(1).max(80),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        kinds: csv(z.enum(['item', 'trinket', 'consumable', 'character', 'boss', 'floor', 'achievement', 'guide', 'transformation'])),
      }),
      req.query,
    );
    const s = store();
    const results = [];
    // Correspondance exacte d'identifiant d'objet (« 105 ») ou de trinket (« t23 »).
    const idMatch = q.q.match(/^(t)?(\d{1,4})$/i);
    if (idMatch) {
      const doc = s.searchDocs.find((d) => (idMatch[1] ? d.kind === 'trinket' : d.kind === 'item') && d.key === idMatch[2]);
      if (doc) results.push({ ...doc, score: 0 });
    }
    for (const r of rankSearch(s, q.q, q.limit * 4)) {
      if (q.kinds?.length && !q.kinds.includes(r.item.kind)) continue;
      if (results.some((x) => x.kind === r.item.kind && x.key === r.item.key)) continue;
      results.push({ ...r.item, score: Math.round(r.score * 1000) / 1000 });
      if (results.length >= q.limit) break;
    }
    return { query: q.q, results: results.map((r) => ({ ...r, extra: markupToText(r.extra).slice(0, 140) })) };
  });
}
