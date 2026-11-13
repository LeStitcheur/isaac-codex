/** Schémas des profils, de la progression et des exports. Partagés entre l'API, le frontend et les tests. */
import { z } from 'zod';
import { entityKind, markKey, type EntityRef, type MarkKey } from './game-schema.js';
import { PLATFORMS, VERSIONS } from './versions.js';

export const unlockStatus = z.enum(['locked', 'in_progress', 'unlocked']);
export type UnlockStatus = z.infer<typeof unlockStatus>;
export const markDifficulty = z.enum(['normal', 'hard']);
export type MarkDifficulty = z.infer<typeof markDifficulty>;
export const itemStatus = z.enum(['seen', 'collected']);
export type ItemStatus = z.infer<typeof itemStatus>;

const versionKeys = VERSIONS.map((v) => v.key) as [string, ...string[]];
const platformKeys = PLATFORMS.map((p) => p.key) as [string, ...string[]];

export const profileSettings = z.object({
  gameVersion: z.enum(versionKeys).default('repentance'),
  platform: z.enum(platformKeys).default('switch'),
  showRepPlusDiff: z.boolean().default(true),
  autoUnlockFromMarks: z.boolean().default(true),
  preferences: z
    .object({
      focus: z.enum(['balanced', 'characters', 'items', 'completion']).default('balanced'),
      avoidHard: z.boolean().default(false),
      favoriteCharacters: z.array(z.string().max(64)).max(40).default([]),
    })
    .default({}),
});
export type ProfileSettings = z.infer<typeof profileSettings>;
export const DEFAULT_SETTINGS: ProfileSettings = profileSettings.parse({});

const slugString = z.string().min(1).max(64).regex(/^[a-z0-9-]+$/);
const keyString = z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/);

export const profileName = z.string().trim().min(1, 'Nom requis').max(40, '40 caractères maximum');
export const password = z.string().min(8, '8 caractères minimum').max(200);

export const createProfileBody = z.object({ name: profileName, password });
export const loginBody = z.object({ name: profileName, password });
export const updateProfileBody = z
  .object({ name: profileName.optional(), password: password.optional(), currentPassword: z.string().max(200).optional() })
  .refine((b) => b.name !== undefined || b.password !== undefined, 'Aucune modification');

export const progressPatch = z
  .object({
    unlocks: z.array(z.object({ achievementId: z.number().int().positive(), status: unlockStatus.nullable() })).max(1000).optional(),
    marks: z.array(z.object({ characterSlug: slugString, markKey, difficulty: markDifficulty.nullable() })).max(1000).optional(),
    favorites: z.array(z.object({ kind: entityKind, key: keyString, favorite: z.boolean() })).max(500).optional(),
    donations: z.object({ donation: z.number().int().min(0).max(999), greed: z.number().int().min(0).max(1000) }).partial().optional(),
    items: z.array(z.object({ kind: z.enum(['item', 'trinket']), key: keyString, status: itemStatus.nullable() })).max(1000).optional(),
    settings: profileSettings.partial().optional(),
    history: z.array(z.object({ kind: entityKind, key: keyString })).max(20).optional(),
  })
  .strict();
export type ProgressPatch = z.infer<typeof progressPatch>;

export const PROFILE_EXPORT_FORMAT = 'isaac-codex-profile';
export const profileExport = z
  .object({
    format: z.literal(PROFILE_EXPORT_FORMAT),
    version: z.literal(1),
    exportedAt: z.string(),
    datasetVersion: z.string(),
    profile: z.object({ name: profileName }),
    settings: profileSettings.partial().default({}),
    unlocks: z.array(z.object({ achievementId: z.number().int().positive(), status: unlockStatus })).max(5000),
    marks: z.array(z.object({ characterSlug: slugString, markKey, difficulty: markDifficulty })).max(5000),
    favorites: z.array(z.object({ kind: entityKind, key: keyString })).max(2000),
    donations: z.object({ donation: z.number().int().min(0).max(999), greed: z.number().int().min(0).max(1000) }),
    items: z.array(z.object({ kind: z.enum(['item', 'trinket']), key: keyString, status: itemStatus })).max(5000),
  })
  .strict();
export type ProfileExport = z.infer<typeof profileExport>;

/** Import : `replace` écrase la progression du compte connecté ; `new` crée un compte (mot de passe obligatoire). */
export const importBody = z
  .object({
    data: profileExport,
    mode: z.enum(['new', 'replace']).default('new'),
    name: profileName.optional(),
    password: password.optional(),
  })
  .refine((b) => b.mode === 'replace' || b.password !== undefined, { message: 'Mot de passe requis pour créer un compte', path: ['password'] });

export interface ProfileProgress {
  profileId: string;
  name: string;
  hasPassword: boolean;
  settings: ProfileSettings;
  unlocks: Record<number, UnlockStatus>;
  marks: Record<string, Partial<Record<MarkKey, MarkDifficulty>>>;
  favorites: EntityRef[];
  donations: { donation: number; greed: number };
  items: Record<string, ItemStatus>;
  history: (EntityRef & { viewedAt: string })[];
}

export function emptyProgress(profileId = 'local', name = 'Profil'): ProfileProgress {
  return {
    profileId,
    name,
    hasPassword: false,
    settings: DEFAULT_SETTINGS,
    unlocks: {},
    marks: {},
    favorites: [],
    donations: { donation: 0, greed: 0 },
    items: {},
    history: [],
  };
}
