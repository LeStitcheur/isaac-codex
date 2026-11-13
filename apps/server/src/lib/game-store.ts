/**
 * Modèle de lecture en mémoire, reconstruit depuis SQLite (source de vérité) au démarrage
 * et après chaque import. ~5 000 entités : les filtres et la recherche floue restent instantanés,
 * même sur un petit VPS.
 */
import Fuse from 'fuse.js';
import {
  type Achievement, type Boss, type Challenge, type Character, type CompletionMark, type Consumable, type DatasetMeta,
  type DonationMilestone, type EntityRef, type Floor, type Guide, type Item, type MarkUnlock, type PlannerPath, type Pool,
  type Route, type SourceRef, type Synergy, type Transformation, type Trinket, markupToText,
} from '../../../../packages/shared/src/index.js';
import type { DbHandle } from '../db/client.js';

type Row = Record<string, unknown>;
const WIKI = 'The Binding of Isaac: Rebirth Wiki (wiki.gg) — CC BY-SA 4.0';

export interface SearchDoc {
  kind: 'item' | 'trinket' | 'consumable' | 'character' | 'boss' | 'floor' | 'achievement' | 'guide' | 'transformation';
  key: string;
  title: string;
  subtitle: string;
  nameEn: string;
  nameFr: string;
  idText: string;
  extra: string;
}

export interface GameStore {
  meta: DatasetMeta;
  items: Item[];
  trinkets: Trinket[];
  consumables: Consumable[];
  characters: Character[];
  achievements: Achievement[];
  completionMarks: CompletionMark[];
  markUnlocks: MarkUnlock[];
  transformations: Transformation[];
  pools: Pool[];
  synergies: Synergy[];
  bosses: Boss[];
  floors: Floor[];
  challenges: Challenge[];
  donationMilestones: DonationMilestone[];
  guides: Guide[];
  plannerPaths: PlannerPath[];
  routes: Route[];
  tips: { text: string; source: string }[];
  byId: {
    item: Map<string, Item>;
    trinket: Map<string, Trinket>;
    consumable: Map<string, Consumable>;
    character: Map<string, Character>;
    achievement: Map<number, Achievement>;
    boss: Map<string, Boss>;
    floor: Map<string, Floor>;
    transformation: Map<string, Transformation>;
    guide: Map<string, Guide>;
  };
  synergiesByRef: Map<string, Synergy[]>;
  synergyCounts: Map<string, number>;
  search: Fuse<SearchDoc>;
  searchDocs: SearchDoc[];
  label(ref: EntityRef): { kind: string; key: string; name: string; nameFr: string | null; exists: boolean };
}

const parse = <T>(v: unknown): T => (typeof v === 'string' ? (JSON.parse(v) as T) : (v as T));
const bool = (v: unknown) => v === 1 || v === true;
const srcOf = (r: Row): SourceRef => ({
  source: WIKI,
  page: (r.source_page as string | null) ?? null,
  revid: (r.source_revid as number | null) ?? null,
  verifiedAt: r.verified_at as string,
  confidence: r.confidence as SourceRef['confidence'],
});

export function loadGameStore(handle: DbHandle): GameStore {
  const db = handle.sqlite;
  const all = (sql: string) => db.prepare(sql).all() as Row[];
  const metaRows = new Map(all('SELECT key, value FROM app_meta').map((r) => [r.key as string, r.value as string]));
  if (!metaRows.get('dataset_version')) throw new Error('Aucune donnée de jeu importée');

  const translations = new Map<string, string>();
  for (const r of all(`SELECT entity_kind, entity_key, field, value FROM translations WHERE lang = 'fr'`)) {
    translations.set(`${r.entity_kind}:${r.entity_key}:${r.field}`, r.value as string);
  }
  const fr = (kind: string, key: string | number, field: string, fallback: string | null) => translations.get(`${kind}:${key}:${field}`) ?? fallback;

  const tagsByItem = new Map<number, string[]>();
  for (const r of all('SELECT item_id, tag FROM item_tags ORDER BY tag')) {
    const id = r.item_id as number;
    if (!tagsByItem.has(id)) tagsByItem.set(id, []);
    tagsByItem.get(id)!.push(r.tag as string);
  }
  const poolsByItem = new Map<number, Item['pools']>();
  for (const r of all('SELECT item_id, pool_key, weight, mask FROM item_pool_entries ORDER BY pool_key')) {
    const id = r.item_id as number;
    if (!poolsByItem.has(id)) poolsByItem.set(id, []);
    poolsByItem.get(id)!.push({ pool: r.pool_key as string, weight: r.weight as number, mask: r.mask as number });
  }

  const transformations: Transformation[] = all('SELECT * FROM transformations ORDER BY id').map((r) => ({
    slug: r.slug as string,
    id: r.id as number,
    nameEn: r.name_en as string,
    nameFr: fr('transformation', r.slug as string, 'name', r.name_fr as string | null),
    description: r.description as string,
    requirement: r.requirement as string,
    membersText: r.members_text as string,
    members: [],
    mask: r.mask as number,
    source: srcOf(r),
  }));
  const trBySlug = new Map(transformations.map((t) => [t.slug, t]));
  const transformationsByItem = new Map<string, string[]>();
  for (const r of all('SELECT * FROM transformation_requirements')) {
    const t = trBySlug.get(r.transformation_slug as string);
    if (!t) continue;
    const ref = { kind: r.entity_kind as EntityRef['kind'], key: r.entity_key as string };
    t.members.push(ref);
    const k = `${ref.kind}:${ref.key}`;
    if (!transformationsByItem.has(k)) transformationsByItem.set(k, []);
    transformationsByItem.get(k)!.push(t.slug);
  }

  const items: Item[] = all('SELECT * FROM items ORDER BY id').map((r) => ({
    id: r.id as number,
    slug: r.slug as string,
    kind: r.kind as Item['kind'],
    familiar: bool(r.familiar),
    nameEn: r.name_en as string,
    nameFr: fr('item', r.id as number, 'name', r.name_fr as string | null),
    quote: r.quote as string | null,
    description: fr('item', r.id as number, 'description', r.description as string)!,
    quality: r.quality as number | null,
    qualityRepPlus: r.quality_rep_plus as number | null,
    recharge: r.recharge as string | null,
    tags: tagsByItem.get(r.id as number) ?? [],
    pools: poolsByItem.get(r.id as number) ?? [],
    unlockAchievementId: r.unlock_achievement_id as number | null,
    mask: r.mask as number,
    effects: r.effects as string | null,
    notes: r.notes as string | null,
    transformations: transformationsByItem.get(`item:${r.id}`) ?? [],
    source: srcOf(r),
  }));

  const trinkets: Trinket[] = all('SELECT * FROM trinkets ORDER BY id').map((r) => ({
    id: r.id as number,
    slug: r.slug as string,
    nameEn: r.name_en as string,
    nameFr: fr('trinket', r.id as number, 'name', r.name_fr as string | null),
    quote: r.quote as string | null,
    description: fr('trinket', r.id as number, 'description', r.description as string)!,
    tags: parse<string[]>(r.tags),
    unlockAchievementId: r.unlock_achievement_id as number | null,
    mask: r.mask as number,
    effects: r.effects as string | null,
    notes: r.notes as string | null,
    source: srcOf(r),
  }));

  const consumables: Consumable[] = all('SELECT * FROM consumables ORDER BY kind, game_id').map((r) => ({
    slug: r.slug as string,
    gameId: r.game_id as number | null,
    kind: r.kind as Consumable['kind'],
    nameEn: r.name_en as string,
    nameFr: fr('consumable', r.slug as string, 'name', r.name_fr as string | null),
    quote: r.quote as string | null,
    description: fr('consumable', r.slug as string, 'description', r.description as string)!,
    horseEffect: r.horse_effect as string | null,
    polarity: r.polarity as Consumable['polarity'],
    unlockAchievementId: r.unlock_achievement_id as number | null,
    mask: r.mask as number,
    effects: r.effects as string | null,
    notes: r.notes as string | null,
    source: srcOf(r),
  }));

  const statsBySlug = new Map(all('SELECT * FROM character_stats').map((r) => [r.character_slug as string, r]));
  const startBySlug = new Map<string, EntityRef[]>();
  for (const r of all('SELECT * FROM character_starting_items ORDER BY sort')) {
    const slug = r.character_slug as string;
    if (!startBySlug.has(slug)) startBySlug.set(slug, []);
    startBySlug.get(slug)!.push({ kind: r.entity_kind as EntityRef['kind'], key: r.entity_key as string });
  }
  const characters: Character[] = all('SELECT * FROM characters ORDER BY sort').map((r) => {
    const s = statsBySlug.get(r.slug as string) ?? {};
    return {
      slug: r.slug as string,
      nameEn: r.name_en as string,
      nameFr: fr('character', r.slug as string, 'name', r.name_fr as string | null),
      tainted: bool(r.tainted),
      baseSlug: r.base_slug as string | null,
      order: r.sort as number,
      forms: parse<string[]>(r.forms),
      health: parse<Record<string, number>>((s as Row).health ?? '{}'),
      pickups: r.pickups as string | null,
      startingItems: startBySlug.get(r.slug as string) ?? [],
      startingText: r.starting_text as string | null,
      stats: {
        damage: ((s as Row).damage as string | null) ?? null,
        tears: ((s as Row).tears as string | null) ?? null,
        speed: ((s as Row).speed as string | null) ?? null,
        range: ((s as Row).range as string | null) ?? null,
        shotSpeed: ((s as Row).shot_speed as string | null) ?? null,
        luck: ((s as Row).luck as string | null) ?? null,
      },
      unlockAchievementId: r.unlock_achievement_id as number | null,
      mask: r.mask as number,
      notes: r.notes as string | null,
      strategy: r.strategy as string | null,
      editorial: r.editorial ? parse<Character['editorial']>(r.editorial) : null,
      source: srcOf(r),
    };
  });

  const prereqs = new Map<number, number[]>();
  for (const r of all('SELECT achievement_id, requires_id FROM unlock_dependencies')) {
    const id = r.achievement_id as number;
    if (!prereqs.has(id)) prereqs.set(id, []);
    prereqs.get(id)!.push(r.requires_id as number);
  }
  const achievements: Achievement[] = all('SELECT * FROM achievements ORDER BY id').map((r) => ({
    id: r.id as number,
    name: r.name as string,
    description: r.description as string,
    requirement: r.requirement as string,
    requirementText: r.requirement_text as string,
    mask: r.mask as number,
    kind: r.kind as Achievement['kind'],
    characterSlug: r.character_slug as string | null,
    coins: r.coins as number | null,
    challengeNumber: r.challenge_number as number | null,
    reward: { kind: r.reward_kind as Achievement['reward']['kind'], key: r.reward_key as string | null, label: r.reward_label as string },
    prerequisites: prereqs.get(r.id as number) ?? [],
    difficulty: r.difficulty as number,
    source: srcOf(r),
  }));

  const completionMarks: CompletionMark[] = all('SELECT * FROM completion_marks ORDER BY sort').map((r) => ({
    key: r.key as CompletionMark['key'],
    order: r.sort as number,
    nameFr: r.name_fr as string,
    nameEn: r.name_en as string,
    boss: r.boss as string,
    hardLabelFr: r.hard_label_fr as string,
    mask: r.mask as number,
    description: r.description as string,
    accessAchievementIds: parse<number[]>(r.access_achievement_ids),
  }));
  const marksByAch = new Map<number, MarkUnlock['marks']>();
  for (const r of all('SELECT * FROM character_unlock_marks m JOIN completion_marks c ON c.key = m.mark_key ORDER BY c.sort')) {
    const id = r.achievement_id as number;
    if (!marksByAch.has(id)) marksByAch.set(id, []);
    marksByAch.get(id)!.push(r.mark_key as MarkUnlock['marks'][number]);
  }
  const markUnlocks: MarkUnlock[] = all('SELECT * FROM character_unlocks').map((r) => ({
    characterSlug: r.character_slug as string,
    achievementId: r.achievement_id as number,
    hard: bool(r.hard),
    marks: marksByAch.get(r.achievement_id as number) ?? [],
  }));

  const pools: Pool[] = all('SELECT * FROM item_pools ORDER BY name_en').map((r) => ({
    key: r.key as string,
    nameEn: r.name_en as string,
    nameFr: r.name_fr as string | null,
    greed: bool(r.greed),
    mask: r.mask as number,
  }));

  const synergies: Synergy[] = all('SELECT * FROM item_synergies ORDER BY id').map((r) => ({
    a: { kind: r.a_kind as EntityRef['kind'], key: r.a_key as string },
    b: { kind: r.b_kind as EntityRef['kind'], key: r.b_key as string },
    section: r.section as Synergy['section'],
    text: r.text as string,
    possiblyNegative: bool(r.possibly_negative),
    mask: r.mask as number | null,
    source: srcOf(r),
  }));
  const synergiesByRef = new Map<string, Synergy[]>();
  const add = (k: string, s: Synergy) => {
    if (!synergiesByRef.has(k)) synergiesByRef.set(k, []);
    synergiesByRef.get(k)!.push(s);
  };
  for (const s of synergies) {
    add(`${s.a.kind}:${s.a.key}`, s);
    add(`${s.b.kind}:${s.b.key}`, s);
  }
  const synergyCounts = new Map<string, number>();
  for (const [k, list] of synergiesByRef) synergyCounts.set(k, list.filter((s) => s.section === 'synergy').length);

  const bosses: Boss[] = all('SELECT * FROM bosses ORDER BY name_en').map((r) => ({
    slug: r.slug as string,
    nameEn: r.name_en as string,
    nameFr: fr('boss', r.slug as string, 'name', r.name_fr as string | null),
    type: r.type as Boss['type'],
    entityId: r.entity_id as number | null,
    variant: r.variant as number | null,
    hp: r.hp as number | null,
    floors: parse<string[]>(r.floors),
    rewards: r.rewards as string | null,
    behavior: r.behavior as string | null,
    notes: r.notes as string | null,
    strategy: r.strategy as string | null,
    unlockAchievementId: r.unlock_achievement_id as number | null,
    mask: r.mask as number,
    source: srcOf(r),
  }));

  const floors: Floor[] = all('SELECT * FROM floors ORDER BY chapter, alternate, name_en').map((r) => ({
    slug: r.slug as string,
    nameEn: r.name_en as string,
    nameFr: fr('floor', r.slug as string, 'name', r.name_fr as string | null),
    chapter: r.chapter as number,
    alternate: bool(r.alternate),
    mask: r.mask as number,
    unlockAchievementId: r.unlock_achievement_id as number | null,
    bosses: parse<string[]>(r.bosses),
    source: srcOf(r),
  }));

  const challenges: Challenge[] = all('SELECT * FROM challenges ORDER BY number').map((r) => ({
    number: r.number as number,
    slug: r.slug as string,
    name: r.name as string,
    goal: r.goal as string,
    description: r.description as string,
    character: r.character_slug as string | null,
    unlockAchievementId: r.unlock_achievement_id as number | null,
    rewardAchievementId: r.reward_achievement_id as number | null,
    mask: r.mask as number,
    source: srcOf(r),
  }));

  const donationMilestones: DonationMilestone[] = all('SELECT * FROM donation_milestones ORDER BY machine, coins').map((r) => ({
    machine: r.machine as DonationMilestone['machine'],
    coins: r.coins as number,
    achievementId: r.achievement_id as number,
    label: r.label as string,
  }));

  const stepsByGuide = new Map<string, Guide['steps']>();
  for (const r of all('SELECT * FROM guide_steps ORDER BY guide_slug, step_index')) {
    const slug = r.guide_slug as string;
    if (!stepsByGuide.has(slug)) stepsByGuide.set(slug, []);
    stepsByGuide.get(slug)!.push({ title: r.title as string, body: r.body as string });
  }
  const guides: Guide[] = all('SELECT * FROM guides ORDER BY priority').map((r) => ({
    ...parse<Omit<Guide, 'steps'>>(r.data),
    steps: stepsByGuide.get(r.slug as string) ?? [],
  }));
  const plannerPaths: PlannerPath[] = all('SELECT data FROM planner_paths ORDER BY sort').map((r) => parse<PlannerPath>(r.data));
  const routes: Route[] = all('SELECT data FROM floor_routes ORDER BY sort').map((r) => parse<Route>(r.data));
  const tips = all('SELECT text, source FROM tips ORDER BY id') as { text: string; source: string }[];

  const meta: DatasetMeta = {
    datasetVersion: metaRows.get('dataset_version')!,
    builtAt: metaRows.get('dataset_built_at') ?? '',
    sources: parse<DatasetMeta['sources']>(metaRows.get('dataset_sources') ?? '[]'),
    counts: parse<Record<string, number>>(metaRows.get('dataset_counts') ?? '{}'),
    referenceVersion: 'repentance',
  };

  const byId = {
    item: new Map(items.map((i) => [String(i.id), i])),
    trinket: new Map(trinkets.map((t) => [String(t.id), t])),
    consumable: new Map(consumables.map((c) => [c.slug, c])),
    character: new Map(characters.map((c) => [c.slug, c])),
    achievement: new Map(achievements.map((a) => [a.id, a])),
    boss: new Map(bosses.map((b) => [b.slug, b])),
    floor: new Map(floors.map((f) => [f.slug, f])),
    transformation: new Map(transformations.map((t) => [t.slug, t])),
    guide: new Map(guides.map((g) => [g.slug, g])),
  };

  const KIND_FR: Record<string, string> = {
    'card': 'Carte', 'special card': 'Carte spéciale', 'rune': 'Rune', 'soul stone': "Pierre d'âme", 'pill': 'Pilule', 'other': 'Consommable',
  };
  const searchDocs: SearchDoc[] = [
    ...items.map((i) => ({ kind: 'item' as const, key: String(i.id), title: i.nameEn, subtitle: `Objet ${i.kind === 'active' ? 'actif' : 'passif'} #${i.id}`, nameEn: i.nameEn, nameFr: i.nameFr ?? '', idText: String(i.id), extra: i.quote ?? '' })),
    ...trinkets.map((t) => ({ kind: 'trinket' as const, key: String(t.id), title: t.nameEn, subtitle: `Trinket #${t.id}`, nameEn: t.nameEn, nameFr: t.nameFr ?? '', idText: `t${t.id}`, extra: t.quote ?? '' })),
    ...consumables.map((c) => ({ kind: 'consumable' as const, key: c.slug, title: c.nameEn, subtitle: KIND_FR[c.kind] ?? 'Consommable', nameEn: c.nameEn, nameFr: c.nameFr ?? '', idText: '', extra: '' })),
    ...characters.map((c) => ({ kind: 'character' as const, key: c.slug, title: c.nameEn, subtitle: c.tainted ? 'Personnage Tainted' : 'Personnage', nameEn: c.nameEn, nameFr: c.nameFr ?? '', idText: '', extra: c.slug })),
    ...bosses.map((b) => ({ kind: 'boss' as const, key: b.slug, title: b.nameEn, subtitle: b.type === 'boss' ? 'Boss' : 'Mini-boss', nameEn: b.nameEn, nameFr: b.nameFr ?? '', idText: '', extra: '' })),
    ...floors.map((f) => ({ kind: 'floor' as const, key: f.slug, title: f.nameEn, subtitle: `Étage — chapitre ${f.chapter}`, nameEn: f.nameEn, nameFr: f.nameFr ?? '', idText: '', extra: '' })),
    ...achievements.map((a) => ({ kind: 'achievement' as const, key: String(a.id), title: a.name, subtitle: `Succès #${a.id}`, nameEn: a.name, nameFr: '', idText: `a${a.id}`, extra: markupToText(a.requirement) })),
    ...guides.map((g) => ({ kind: 'guide' as const, key: g.slug, title: g.title, subtitle: 'Guide', nameEn: '', nameFr: g.title, idText: '', extra: markupToText(g.summary) })),
    ...transformations.map((t) => ({ kind: 'transformation' as const, key: t.slug, title: t.nameEn, subtitle: 'Transformation', nameEn: t.nameEn, nameFr: t.nameFr ?? '', idText: '', extra: '' })),
  ];
  const search = new Fuse(searchDocs, {
    keys: [
      { name: 'nameFr', weight: 3 },
      { name: 'nameEn', weight: 3 },
      { name: 'title', weight: 2 },
      { name: 'idText', weight: 2 },
      { name: 'extra', weight: 0.5 },
    ],
    threshold: 0.34,
    ignoreLocation: true,
    ignoreDiacritics: true,
    includeScore: true,
    minMatchCharLength: 2,
  });

  const label: GameStore['label'] = (ref) => {
    const map: Record<string, Map<string, { nameEn?: string; name?: string; title?: string; nameFr?: string | null }>> = {
      item: byId.item, trinket: byId.trinket, consumable: byId.consumable, character: byId.character, boss: byId.boss,
      floor: byId.floor, transformation: byId.transformation,
    };
    const e = ref.kind === 'achievement' ? byId.achievement.get(Number(ref.key)) : map[ref.kind]?.get(ref.key);
    const name = e ? ((e as { nameEn?: string }).nameEn ?? (e as { name?: string }).name ?? ref.key) : ref.key;
    return { kind: ref.kind, key: ref.key, name, nameFr: (e as { nameFr?: string | null } | undefined)?.nameFr ?? null, exists: !!e };
  };

  return {
    meta, items, trinkets, consumables, characters, achievements, completionMarks, markUnlocks, transformations, pools,
    synergies, bosses, floors, challenges, donationMilestones, guides, plannerPaths, routes, tips,
    byId, synergiesByRef, synergyCounts, search, searchDocs, label,
  };
}
