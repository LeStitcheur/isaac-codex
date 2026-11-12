/**
 * Schéma SQLite normalisé (Drizzle ORM).
 * - Tables « jeu » : réinitialisées par le seed quand la version du jeu de données change.
 * - Tables « profil » : jamais touchées par le seed. Elles référencent les entités du jeu par leurs clés
 *   stables (id d'objet, id de succès, slug) et non par clé étrangère, pour survivre aux mises à jour des données.
 */
import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

const source = {
  sourcePage: text('source_page'),
  sourceRevid: integer('source_revid'),
  verifiedAt: text('verified_at').notNull(),
  confidence: text('confidence').notNull(),
};

/* ----------------------------- Méta & référentiels ----------------------------- */

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const gameVersions = sqliteTable('game_versions', {
  key: text('key').primaryKey(),
  bit: integer('bit').notNull().unique(),
  label: text('label').notNull(),
  sort: integer('sort').notNull(),
});

export const sources = sqliteTable('sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  license: text('license').notNull(),
  licenseUrl: text('license_url').notNull(),
  fetchedAt: text('fetched_at').notNull(),
  method: text('method').notNull(),
  datasetVersion: text('dataset_version').notNull(),
  importedAt: text('imported_at').notNull(),
});

export const translations = sqliteTable(
  'translations',
  {
    entityKind: text('entity_kind').notNull(),
    entityKey: text('entity_key').notNull(),
    field: text('field').notNull(),
    lang: text('lang').notNull(),
    value: text('value').notNull(),
    source: text('source'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.entityKind, t.entityKey, t.field, t.lang] })],
);

/* ----------------------------------- Objets ----------------------------------- */

export const items = sqliteTable(
  'items',
  {
    id: integer('id').primaryKey(),
    slug: text('slug').notNull(),
    kind: text('kind').notNull(),
    familiar: integer('familiar', { mode: 'boolean' }).notNull(),
    nameEn: text('name_en').notNull(),
    nameFr: text('name_fr'),
    quote: text('quote'),
    description: text('description').notNull(),
    quality: integer('quality'),
    qualityRepPlus: integer('quality_rep_plus'),
    recharge: text('recharge'),
    unlockAchievementId: integer('unlock_achievement_id'),
    mask: integer('mask').notNull(),
    effects: text('effects'),
    notes: text('notes'),
    ...source,
  },
  (t) => [index('items_quality_idx').on(t.quality), index('items_kind_idx').on(t.kind), index('items_name_idx').on(t.nameEn)],
);

export const itemTags = sqliteTable(
  'item_tags',
  {
    itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.tag] }), index('item_tags_tag_idx').on(t.tag)],
);

export const itemPools = sqliteTable('item_pools', {
  key: text('key').primaryKey(),
  nameEn: text('name_en').notNull(),
  nameFr: text('name_fr'),
  greed: integer('greed', { mode: 'boolean' }).notNull(),
  mask: integer('mask').notNull(),
});

export const itemPoolEntries = sqliteTable(
  'item_pool_entries',
  {
    itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
    poolKey: text('pool_key').notNull(),
    weight: real('weight').notNull(),
    mask: integer('mask').notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.poolKey, t.mask] }), index('item_pool_entries_pool_idx').on(t.poolKey)],
);

export const trinkets = sqliteTable('trinkets', {
  id: integer('id').primaryKey(),
  slug: text('slug').notNull(),
  nameEn: text('name_en').notNull(),
  nameFr: text('name_fr'),
  quote: text('quote'),
  description: text('description').notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
  unlockAchievementId: integer('unlock_achievement_id'),
  mask: integer('mask').notNull(),
  effects: text('effects'),
  notes: text('notes'),
  ...source,
});

export const consumables = sqliteTable(
  'consumables',
  {
    slug: text('slug').primaryKey(),
    gameId: integer('game_id'),
    kind: text('kind').notNull(),
    nameEn: text('name_en').notNull(),
    nameFr: text('name_fr'),
    quote: text('quote'),
    description: text('description').notNull(),
    horseEffect: text('horse_effect'),
    polarity: text('polarity'),
    unlockAchievementId: integer('unlock_achievement_id'),
    mask: integer('mask').notNull(),
    effects: text('effects'),
    notes: text('notes'),
    ...source,
  },
  (t) => [index('consumables_kind_idx').on(t.kind)],
);

/* -------------------------------- Personnages -------------------------------- */

export const characters = sqliteTable('characters', {
  slug: text('slug').primaryKey(),
  nameEn: text('name_en').notNull(),
  nameFr: text('name_fr'),
  tainted: integer('tainted', { mode: 'boolean' }).notNull(),
  baseSlug: text('base_slug'),
  sort: integer('sort').notNull(),
  forms: text('forms', { mode: 'json' }).$type<string[]>().notNull(),
  pickups: text('pickups'),
  startingText: text('starting_text'),
  unlockAchievementId: integer('unlock_achievement_id'),
  mask: integer('mask').notNull(),
  notes: text('notes'),
  strategy: text('strategy'),
  editorial: text('editorial', { mode: 'json' }),
  ...source,
});

export const characterStats = sqliteTable('character_stats', {
  characterSlug: text('character_slug').primaryKey().references(() => characters.slug, { onDelete: 'cascade' }),
  health: text('health', { mode: 'json' }).$type<Record<string, number>>().notNull(),
  damage: text('damage'),
  tears: text('tears'),
  speed: text('speed'),
  range: text('range'),
  shotSpeed: text('shot_speed'),
  luck: text('luck'),
});

export const characterStartingItems = sqliteTable(
  'character_starting_items',
  {
    characterSlug: text('character_slug').notNull().references(() => characters.slug, { onDelete: 'cascade' }),
    entityKind: text('entity_kind').notNull(),
    entityKey: text('entity_key').notNull(),
    sort: integer('sort').notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterSlug, t.entityKind, t.entityKey] })],
);

/* ------------------------------ Succès & marques ------------------------------ */

export const achievements = sqliteTable(
  'achievements',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    requirement: text('requirement').notNull(),
    requirementText: text('requirement_text').notNull(),
    mask: integer('mask').notNull(),
    kind: text('kind').notNull(),
    characterSlug: text('character_slug'),
    coins: integer('coins'),
    challengeNumber: integer('challenge_number'),
    rewardKind: text('reward_kind').notNull(),
    rewardKey: text('reward_key'),
    rewardLabel: text('reward_label').notNull(),
    difficulty: integer('difficulty').notNull(),
    ...source,
  },
  (t) => [index('achievements_character_idx').on(t.characterSlug), index('achievements_kind_idx').on(t.kind)],
);

export const unlockConditions = sqliteTable('unlock_conditions', {
  achievementId: integer('achievement_id').primaryKey().references(() => achievements.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  characterSlug: text('character_slug'),
  coins: integer('coins'),
  challengeNumber: integer('challenge_number'),
  text: text('text').notNull(),
});

export const unlockDependencies = sqliteTable(
  'unlock_dependencies',
  {
    achievementId: integer('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
    requiresId: integer('requires_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.achievementId, t.requiresId] }), index('unlock_dependencies_requires_idx').on(t.requiresId)],
);

export const completionMarks = sqliteTable('completion_marks', {
  key: text('key').primaryKey(),
  sort: integer('sort').notNull(),
  nameFr: text('name_fr').notNull(),
  nameEn: text('name_en').notNull(),
  boss: text('boss').notNull(),
  hardLabelFr: text('hard_label_fr').notNull(),
  mask: integer('mask').notNull(),
  description: text('description').notNull(),
  accessAchievementIds: text('access_achievement_ids', { mode: 'json' }).$type<number[]>().notNull(),
});

export const characterUnlocks = sqliteTable(
  'character_unlocks',
  {
    achievementId: integer('achievement_id').primaryKey().references(() => achievements.id, { onDelete: 'cascade' }),
    characterSlug: text('character_slug').notNull().references(() => characters.slug, { onDelete: 'cascade' }),
    hard: integer('hard', { mode: 'boolean' }).notNull(),
  },
  (t) => [index('character_unlocks_character_idx').on(t.characterSlug)],
);

export const characterUnlockMarks = sqliteTable(
  'character_unlock_marks',
  {
    achievementId: integer('achievement_id').notNull().references(() => characterUnlocks.achievementId, { onDelete: 'cascade' }),
    markKey: text('mark_key').notNull().references(() => completionMarks.key),
  },
  (t) => [primaryKey({ columns: [t.achievementId, t.markKey] })],
);

export const donationMilestones = sqliteTable(
  'donation_milestones',
  {
    machine: text('machine').notNull(),
    coins: integer('coins').notNull(),
    achievementId: integer('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
  },
  (t) => [primaryKey({ columns: [t.machine, t.coins] })],
);

export const challenges = sqliteTable('challenges', {
  number: integer('number').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  goal: text('goal').notNull(),
  description: text('description').notNull(),
  characterSlug: text('character_slug'),
  unlockAchievementId: integer('unlock_achievement_id'),
  rewardAchievementId: integer('reward_achievement_id'),
  mask: integer('mask').notNull(),
  ...source,
});

/* --------------------------- Transformations & synergies --------------------------- */

export const transformations = sqliteTable('transformations', {
  slug: text('slug').primaryKey(),
  id: integer('id').notNull(),
  nameEn: text('name_en').notNull(),
  nameFr: text('name_fr'),
  description: text('description').notNull(),
  requirement: text('requirement').notNull(),
  membersText: text('members_text').notNull(),
  mask: integer('mask').notNull(),
  ...source,
});

export const transformationRequirements = sqliteTable(
  'transformation_requirements',
  {
    transformationSlug: text('transformation_slug').notNull().references(() => transformations.slug, { onDelete: 'cascade' }),
    entityKind: text('entity_kind').notNull(),
    entityKey: text('entity_key').notNull(),
  },
  (t) => [primaryKey({ columns: [t.transformationSlug, t.entityKind, t.entityKey] }), index('transformation_requirements_entity_idx').on(t.entityKind, t.entityKey)],
);

export const itemSynergies = sqliteTable(
  'item_synergies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    aKind: text('a_kind').notNull(),
    aKey: text('a_key').notNull(),
    bKind: text('b_kind').notNull(),
    bKey: text('b_key').notNull(),
    section: text('section').notNull(),
    text: text('text').notNull(),
    possiblyNegative: integer('possibly_negative', { mode: 'boolean' }).notNull(),
    mask: integer('mask'),
    ...source,
  },
  (t) => [index('item_synergies_a_idx').on(t.aKind, t.aKey), index('item_synergies_b_idx').on(t.bKind, t.bKey)],
);

/* ------------------------------ Boss, étages, routes ------------------------------ */

export const bosses = sqliteTable('bosses', {
  slug: text('slug').primaryKey(),
  nameEn: text('name_en').notNull(),
  nameFr: text('name_fr'),
  type: text('type').notNull(),
  entityId: integer('entity_id'),
  variant: integer('variant'),
  hp: real('hp'),
  floors: text('floors', { mode: 'json' }).$type<string[]>().notNull(),
  rewards: text('rewards'),
  behavior: text('behavior'),
  notes: text('notes'),
  strategy: text('strategy'),
  unlockAchievementId: integer('unlock_achievement_id'),
  mask: integer('mask').notNull(),
  ...source,
});

export const floors = sqliteTable('floors', {
  slug: text('slug').primaryKey(),
  nameEn: text('name_en').notNull(),
  nameFr: text('name_fr'),
  chapter: integer('chapter').notNull(),
  alternate: integer('alternate', { mode: 'boolean' }).notNull(),
  mask: integer('mask').notNull(),
  unlockAchievementId: integer('unlock_achievement_id'),
  bosses: text('bosses', { mode: 'json' }).$type<string[]>().notNull(),
  ...source,
});

export const floorRoutes = sqliteTable('floor_routes', {
  slug: text('slug').primaryKey(),
  sort: integer('sort').notNull(),
  data: text('data', { mode: 'json' }).notNull(),
});

/* ----------------------------- Guides & planificateur ----------------------------- */

export const guides = sqliteTable('guides', {
  slug: text('slug').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  level: text('level').notNull(),
  priority: integer('priority').notNull(),
  summary: text('summary').notNull(),
  data: text('data', { mode: 'json' }).notNull(),
});

export const guideSteps = sqliteTable(
  'guide_steps',
  {
    guideSlug: text('guide_slug').notNull().references(() => guides.slug, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
  },
  (t) => [primaryKey({ columns: [t.guideSlug, t.stepIndex] })],
);

export const plannerPaths = sqliteTable('planner_paths', {
  slug: text('slug').primaryKey(),
  sort: integer('sort').notNull(),
  data: text('data', { mode: 'json' }).notNull(),
});

export const tips = sqliteTable('tips', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  source: text('source').notNull(),
});

/* ----------------------------------- Profils ----------------------------------- */

export const profiles = sqliteTable(
  'profiles',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    passwordHash: text('password_hash'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('profiles_name_key_idx').on(t.nameKey)],
);

export const profileTokens = sqliteTable(
  'profile_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at').notNull(),
  },
  (t) => [index('profile_tokens_profile_idx').on(t.profileId)],
);

export const profileSettings = sqliteTable('profile_settings', {
  profileId: text('profile_id').primaryKey().references(() => profiles.id, { onDelete: 'cascade' }),
  settings: text('settings', { mode: 'json' }).notNull(),
});

export const profileUnlocks = sqliteTable(
  'profile_unlocks',
  {
    profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    achievementId: integer('achievement_id').notNull(),
    status: text('status').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.achievementId] })],
);

export const profileCompletionMarks = sqliteTable(
  'profile_completion_marks',
  {
    profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    characterSlug: text('character_slug').notNull(),
    markKey: text('mark_key').notNull(),
    difficulty: text('difficulty').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.characterSlug, t.markKey] })],
);

export const profileFavorites = sqliteTable(
  'profile_favorites',
  {
    profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    entityKind: text('entity_kind').notNull(),
    entityKey: text('entity_key').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.entityKind, t.entityKey] })],
);

export const profileDonations = sqliteTable(
  'profile_donations',
  {
    profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    machine: text('machine').notNull(),
    coins: integer('coins').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.machine] })],
);

export const profileItems = sqliteTable(
  'profile_items',
  {
    profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    entityKind: text('entity_kind').notNull(),
    entityKey: text('entity_key').notNull(),
    status: text('status').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.entityKind, t.entityKey] })],
);

export const profileHistory = sqliteTable(
  'profile_history',
  {
    profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    entityKind: text('entity_kind').notNull(),
    entityKey: text('entity_key').notNull(),
    viewedAt: text('viewed_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.entityKind, t.entityKey] }), index('profile_history_viewed_idx').on(t.profileId, t.viewedAt)],
);
