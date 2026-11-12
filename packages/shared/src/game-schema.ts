/**
 * Schémas Zod du jeu de données Isaac Codex.
 * Utilisés par : le script de construction (validation à la génération), le seed SQLite
 * (validation à l'import) et l'importeur JSON/CSV.
 */
import { z } from 'zod';

/** Masque de bits des versions : 1 Rebirth, 2 Afterbirth, 4 Afterbirth+, 8 Repentance, 16 Repentance+. */
export const versionMask = z.number().int().min(0).max(31);

export const confidence = z.enum(['high', 'medium', 'low', 'editorial']);
export type Confidence = z.infer<typeof confidence>;

export const sourceRef = z.object({
  source: z.string(),
  page: z.string().nullable(),
  revid: z.number().int().nullable(),
  verifiedAt: z.string(),
  confidence,
});
export type SourceRef = z.infer<typeof sourceRef>;

export const entityKind = z.enum(['item', 'trinket', 'consumable', 'character', 'boss', 'floor', 'achievement', 'transformation']);
export type EntityKind = z.infer<typeof entityKind>;

export const entityRef = z.object({ kind: entityKind, key: z.string() });
export type EntityRef = z.infer<typeof entityRef>;

export const poolEntry = z.object({ pool: z.string(), weight: z.number(), mask: versionMask });

export const item = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  kind: z.enum(['active', 'passive']),
  familiar: z.boolean(),
  nameEn: z.string().min(1),
  nameFr: z.string().nullable(),
  quote: z.string().nullable(),
  description: z.string(),
  quality: z.number().int().min(0).max(4).nullable(),
  qualityRepPlus: z.number().int().min(0).max(4).nullable(),
  recharge: z.string().nullable(),
  tags: z.array(z.string()),
  pools: z.array(poolEntry),
  unlockAchievementId: z.number().int().nullable(),
  mask: versionMask,
  effects: z.string().nullable(),
  notes: z.string().nullable(),
  transformations: z.array(z.string()),
  source: sourceRef,
});
export type Item = z.infer<typeof item>;

export const trinket = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  nameEn: z.string().min(1),
  nameFr: z.string().nullable(),
  quote: z.string().nullable(),
  description: z.string(),
  tags: z.array(z.string()),
  unlockAchievementId: z.number().int().nullable(),
  mask: versionMask,
  effects: z.string().nullable(),
  notes: z.string().nullable(),
  source: sourceRef,
});
export type Trinket = z.infer<typeof trinket>;

export const consumableKind = z.enum(['card', 'special card', 'rune', 'soul stone', 'pill', 'other']);
export const consumable = z.object({
  slug: z.string().min(1),
  gameId: z.number().int().nullable(),
  kind: consumableKind,
  nameEn: z.string().min(1),
  nameFr: z.string().nullable(),
  quote: z.string().nullable(),
  description: z.string(),
  horseEffect: z.string().nullable(),
  polarity: z.enum(['positive', 'negative', 'neutral']).nullable(),
  unlockAchievementId: z.number().int().nullable(),
  mask: versionMask,
  effects: z.string().nullable(),
  notes: z.string().nullable(),
  source: sourceRef,
});
export type Consumable = z.infer<typeof consumable>;

export const characterStats = z.object({
  damage: z.string().nullable(),
  tears: z.string().nullable(),
  speed: z.string().nullable(),
  range: z.string().nullable(),
  shotSpeed: z.string().nullable(),
  luck: z.string().nullable(),
});

export const character = z.object({
  slug: z.string().min(1),
  nameEn: z.string().min(1),
  nameFr: z.string().nullable(),
  tainted: z.boolean(),
  baseSlug: z.string().nullable(),
  order: z.number().int(),
  forms: z.array(z.string()),
  health: z.record(z.string(), z.number()),
  pickups: z.string().nullable(),
  startingItems: z.array(entityRef),
  startingText: z.string().nullable(),
  stats: characterStats,
  unlockAchievementId: z.number().int().nullable(),
  mask: versionMask,
  notes: z.string().nullable(),
  strategy: z.string().nullable(),
  editorial: z
    .object({
      difficulty: z.number().int().min(1).max(5),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      tips: z.array(z.string()),
    })
    .nullable(),
  source: sourceRef,
});
export type Character = z.infer<typeof character>;

export const achievementKind = z.enum(['mark', 'allMarks', 'donation', 'greedDonation', 'challenge', 'other']);
export const rewardKind = z.enum(['item', 'trinket', 'consumable', 'character', 'floor', 'baby', 'challenge', 'other']);

export const achievement = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string(),
  requirement: z.string(),
  requirementText: z.string(),
  mask: versionMask,
  kind: achievementKind,
  characterSlug: z.string().nullable(),
  coins: z.number().int().nullable(),
  challengeNumber: z.number().int().nullable(),
  reward: z.object({ kind: rewardKind, key: z.string().nullable(), label: z.string() }),
  prerequisites: z.array(z.number().int()),
  difficulty: z.number().min(1).max(5),
  source: sourceRef,
});
export type Achievement = z.infer<typeof achievement>;

export const markKey = z.enum([
  'heart', 'isaac', 'bluebaby', 'satan', 'lamb', 'megasatan', 'bossrush', 'hush', 'greed', 'delirium', 'mother', 'beast',
]);
export type MarkKey = z.infer<typeof markKey>;

export const completionMark = z.object({
  key: markKey,
  order: z.number().int(),
  nameFr: z.string(),
  nameEn: z.string(),
  boss: z.string(),
  hardLabelFr: z.string(),
  mask: versionMask,
  accessAchievementIds: z.array(z.number().int()),
  description: z.string(),
});
export type CompletionMark = z.infer<typeof completionMark>;

export const markUnlock = z.object({
  characterSlug: z.string(),
  achievementId: z.number().int(),
  marks: z.array(markKey).min(1),
  hard: z.boolean(),
});
export type MarkUnlock = z.infer<typeof markUnlock>;

export const transformation = z.object({
  slug: z.string(),
  id: z.number().int(),
  nameEn: z.string(),
  nameFr: z.string().nullable(),
  description: z.string(),
  requirement: z.string(),
  members: z.array(entityRef),
  membersText: z.string(),
  mask: versionMask,
  source: sourceRef,
});
export type Transformation = z.infer<typeof transformation>;

export const pool = z.object({ key: z.string(), nameEn: z.string(), nameFr: z.string().nullable(), greed: z.boolean(), mask: versionMask });
export type Pool = z.infer<typeof pool>;

export const synergy = z.object({
  a: entityRef,
  b: entityRef,
  section: z.enum(['synergy', 'interaction']),
  text: z.string(),
  possiblyNegative: z.boolean(),
  mask: versionMask.nullable(),
  source: sourceRef,
});
export type Synergy = z.infer<typeof synergy>;

export const boss = z.object({
  slug: z.string(),
  nameEn: z.string(),
  nameFr: z.string().nullable(),
  type: z.enum(['boss', 'mini-boss']),
  entityId: z.number().int().nullable(),
  variant: z.number().int().nullable(),
  hp: z.number().nullable(),
  floors: z.array(z.string()),
  rewards: z.string().nullable(),
  behavior: z.string().nullable(),
  notes: z.string().nullable(),
  strategy: z.string().nullable(),
  unlockAchievementId: z.number().int().nullable(),
  mask: versionMask,
  source: sourceRef,
});
export type Boss = z.infer<typeof boss>;

export const floor = z.object({
  slug: z.string(),
  nameEn: z.string(),
  nameFr: z.string().nullable(),
  chapter: z.number().int(),
  alternate: z.boolean(),
  mask: versionMask,
  unlockAchievementId: z.number().int().nullable(),
  bosses: z.array(z.string()),
  source: sourceRef,
});
export type Floor = z.infer<typeof floor>;

export const challenge = z.object({
  number: z.number().int(),
  slug: z.string(),
  name: z.string(),
  goal: z.string(),
  description: z.string(),
  character: z.string().nullable(),
  unlockAchievementId: z.number().int().nullable(),
  rewardAchievementId: z.number().int().nullable(),
  mask: versionMask,
  source: sourceRef,
});
export type Challenge = z.infer<typeof challenge>;

/* ---------- Contenus éditoriaux (rédigés en français, sourcés) ---------- */

export const guideCategory = z.enum([
  'debutant', 'intermediaire', 'expert', 'personnages', 'deblocages', 'objets', 'boss', 'chemins', 'machines', 'optimisation', 'secrets',
]);

export const guide = z.object({
  slug: z.string(),
  title: z.string(),
  category: guideCategory,
  level: z.enum(['debutant', 'intermediaire', 'expert']),
  priority: z.number().int(),
  summary: z.string(),
  prerequisites: z.array(z.string()),
  steps: z.array(z.object({ title: z.string(), body: z.string() })).min(1),
  tips: z.array(z.string()),
  risks: z.array(z.string()),
  alternatives: z.array(z.string()),
  versionNotes: z.array(z.object({ mask: versionMask, text: z.string() })),
  related: z.array(entityRef),
  achievementIds: z.array(z.number().int()),
  sources: z.array(z.string()),
});
export type Guide = z.infer<typeof guide>;

export const plannerPath = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  goalAchievementIds: z.array(z.number().int()),
  steps: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
      achievementIds: z.array(z.number().int()),
      random: z.boolean(),
    }),
  ),
  guideSlug: z.string().nullable(),
});
export type PlannerPath = z.infer<typeof plannerPath>;

export const route = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  color: z.string(),
  stages: z.array(z.object({ label: z.string(), floors: z.array(z.string()), note: z.string().nullable() })),
  finalBoss: z.string(),
  requirements: z.array(z.string()),
  achievementIds: z.array(z.number().int()),
  marks: z.array(markKey),
});
export type Route = z.infer<typeof route>;

export const tip = z.object({ text: z.string(), source: z.string() });

export const donationMilestone = z.object({
  machine: z.enum(['donation', 'greed']),
  coins: z.number().int().positive(),
  achievementId: z.number().int(),
  label: z.string(),
});
export type DonationMilestone = z.infer<typeof donationMilestone>;

export const datasetMeta = z.object({
  datasetVersion: z.string(),
  builtAt: z.string(),
  sources: z.array(
    z.object({ name: z.string(), url: z.string(), license: z.string(), licenseUrl: z.string(), fetchedAt: z.string(), method: z.string() }),
  ),
  counts: z.record(z.string(), z.number()),
  referenceVersion: z.literal('repentance'),
});
export type DatasetMeta = z.infer<typeof datasetMeta>;

export const dataset = z.object({
  meta: datasetMeta,
  items: z.array(item),
  trinkets: z.array(trinket),
  consumables: z.array(consumable),
  characters: z.array(character),
  achievements: z.array(achievement),
  completionMarks: z.array(completionMark),
  markUnlocks: z.array(markUnlock),
  transformations: z.array(transformation),
  pools: z.array(pool),
  synergies: z.array(synergy),
  bosses: z.array(boss),
  floors: z.array(floor),
  challenges: z.array(challenge),
  donationMilestones: z.array(donationMilestone),
  guides: z.array(guide),
  plannerPaths: z.array(plannerPath),
  routes: z.array(route),
  tips: z.array(tip),
});
export type Dataset = z.infer<typeof dataset>;
