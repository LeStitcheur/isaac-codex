/**
 * Profils, progression, export/import.
 * Toutes les routes /api/profiles/:id/* exigent un jeton valide pour ce profil précis.
 * Stockage : base libSQL des profils (Turso en production, fichier SQLite local sinon).
 * Les écritures multiples passent par des lots atomiques (`batch(…, 'write')`).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DEFAULT_SETTINGS, PROFILE_EXPORT_FORMAT, createProfileBody, importBody, loginBody, profileSettings, progressPatch, updateProfileBody,
  computeStats, recommend, pathProgress, computeStatuses, versionBit,
  type EntityRef, type ProfileExport, type ProfileProgress, type ProfileSettings, type ProgressPatch, type VersionKey,
} from '../../../../packages/shared/src/index.js';
import type { AppContext } from '../app.js';
import { PROFILE_CHILD_TABLES, type InStatement, type ProfileDb } from '../db/profile-db.js';
import { AppError, badRequest, notFound, parse } from '../lib/errors.js';
import { hashPassword, issueToken, issueTokenStatements, newProfileId, newToken, requireProfile, revokeToken, verifyPassword } from '../lib/auth.js';

const nameKey = (name: string) => name.trim().toLocaleLowerCase('fr').normalize('NFKC');
const isUniqueViolation = (e: unknown) => String(e).includes('UNIQUE');

function parseSettings(raw: string | null | undefined): ProfileSettings {
  const parsed = profileSettings.safeParse(raw ? JSON.parse(raw) : {});
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

async function readSettings(profiles: ProfileDb, profileId: string): Promise<ProfileSettings> {
  const row = (await profiles.execute({ sql: 'SELECT settings FROM profile_settings WHERE profile_id = ?', args: [profileId] })).rows[0];
  return parseSettings(row?.settings as string | undefined);
}

export async function loadProgress(profiles: ProfileDb, profileId: string): Promise<ProfileProgress> {
  const args = [profileId];
  // Un seul aller-retour réseau pour toutes les lectures (important avec une base distante).
  const [profile, settings, unlockRows, markRows, donationRows, itemRows, favoriteRows, historyRows] = await profiles.batch(
    [
      { sql: 'SELECT id, name, password_hash FROM profiles WHERE id = ?', args },
      { sql: 'SELECT settings FROM profile_settings WHERE profile_id = ?', args },
      { sql: 'SELECT achievement_id, status FROM profile_unlocks WHERE profile_id = ?', args },
      { sql: 'SELECT character_slug, mark_key, difficulty FROM profile_completion_marks WHERE profile_id = ?', args },
      { sql: 'SELECT machine, coins FROM profile_donations WHERE profile_id = ?', args },
      { sql: 'SELECT entity_kind, entity_key, status FROM profile_items WHERE profile_id = ?', args },
      { sql: 'SELECT entity_kind, entity_key FROM profile_favorites WHERE profile_id = ? ORDER BY created_at DESC', args },
      { sql: 'SELECT entity_kind, entity_key, viewed_at FROM profile_history WHERE profile_id = ? ORDER BY viewed_at DESC LIMIT 20', args },
    ],
    'read',
  );
  const p = profile!.rows[0];
  if (!p) throw notFound('Profil');
  const unlocks: ProfileProgress['unlocks'] = {};
  for (const r of unlockRows!.rows) unlocks[r.achievement_id as number] = r.status as ProfileProgress['unlocks'][number];
  const marks: ProfileProgress['marks'] = {};
  for (const r of markRows!.rows) {
    const slug = r.character_slug as string;
    marks[slug] ??= {};
    marks[slug]![r.mark_key as keyof ProfileProgress['marks'][string]] = r.difficulty as 'normal' | 'hard';
  }
  const donations = { donation: 0, greed: 0 };
  for (const r of donationRows!.rows) {
    if (r.machine === 'donation' || r.machine === 'greed') donations[r.machine] = r.coins as number;
  }
  const items: ProfileProgress['items'] = {};
  for (const r of itemRows!.rows) items[`${r.entity_kind}:${r.entity_key}`] = r.status as 'seen' | 'collected';
  return {
    profileId,
    name: p.name as string,
    hasPassword: !!p.password_hash,
    settings: parseSettings(settings!.rows[0]?.settings as string | undefined),
    unlocks,
    marks,
    favorites: favoriteRows!.rows.map((r) => ({ kind: r.entity_kind as EntityRef['kind'], key: r.entity_key as string })),
    donations,
    items,
    history: historyRows!.rows.map((r) => ({ kind: r.entity_kind as EntityRef['kind'], key: r.entity_key as string, viewedAt: r.viewed_at as string })),
  };
}

/** Instructions SQL d'un patch de progression (à exécuter dans un lot atomique). */
export function patchStatements(profileId: string, patch: ProgressPatch, currentSettings: ProfileSettings): InStatement[] {
  const now = new Date().toISOString();
  const out: InStatement[] = [];
  const add = (sql: string, ...args: (string | number | null)[]) => out.push({ sql, args });
  for (const u of patch.unlocks ?? []) {
    if (u.status === null) add('DELETE FROM profile_unlocks WHERE profile_id = ? AND achievement_id = ?', profileId, u.achievementId);
    else
      add(
        `INSERT INTO profile_unlocks (profile_id, achievement_id, status, updated_at) VALUES (?,?,?,?)
         ON CONFLICT(profile_id, achievement_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        profileId, u.achievementId, u.status, now,
      );
  }
  for (const m of patch.marks ?? []) {
    if (m.difficulty === null) add('DELETE FROM profile_completion_marks WHERE profile_id = ? AND character_slug = ? AND mark_key = ?', profileId, m.characterSlug, m.markKey);
    else
      add(
        `INSERT INTO profile_completion_marks (profile_id, character_slug, mark_key, difficulty, updated_at) VALUES (?,?,?,?,?)
         ON CONFLICT(profile_id, character_slug, mark_key) DO UPDATE SET difficulty = excluded.difficulty, updated_at = excluded.updated_at`,
        profileId, m.characterSlug, m.markKey, m.difficulty, now,
      );
  }
  for (const f of patch.favorites ?? []) {
    if (f.favorite) add('INSERT OR IGNORE INTO profile_favorites (profile_id, entity_kind, entity_key, created_at) VALUES (?,?,?,?)', profileId, f.kind, f.key, now);
    else add('DELETE FROM profile_favorites WHERE profile_id = ? AND entity_kind = ? AND entity_key = ?', profileId, f.kind, f.key);
  }
  if (patch.donations) {
    for (const [machine, coins] of Object.entries(patch.donations)) {
      if (coins === undefined) continue;
      add(
        `INSERT INTO profile_donations (profile_id, machine, coins, updated_at) VALUES (?,?,?,?)
         ON CONFLICT(profile_id, machine) DO UPDATE SET coins = excluded.coins, updated_at = excluded.updated_at`,
        profileId, machine, coins, now,
      );
    }
  }
  for (const i of patch.items ?? []) {
    if (i.status === null) add('DELETE FROM profile_items WHERE profile_id = ? AND entity_kind = ? AND entity_key = ?', profileId, i.kind, i.key);
    else
      add(
        `INSERT INTO profile_items (profile_id, entity_kind, entity_key, status, updated_at) VALUES (?,?,?,?,?)
         ON CONFLICT(profile_id, entity_kind, entity_key) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        profileId, i.kind, i.key, i.status, now,
      );
  }
  if (patch.settings) {
    const merged = profileSettings.parse({ ...currentSettings, ...patch.settings });
    add(
      `INSERT INTO profile_settings (profile_id, settings) VALUES (?, ?) ON CONFLICT(profile_id) DO UPDATE SET settings = excluded.settings`,
      profileId, JSON.stringify(merged),
    );
  }
  for (const h of patch.history ?? []) {
    add(
      `INSERT INTO profile_history (profile_id, entity_kind, entity_key, viewed_at) VALUES (?,?,?,?)
       ON CONFLICT(profile_id, entity_kind, entity_key) DO UPDATE SET viewed_at = excluded.viewed_at`,
      profileId, h.kind, h.key, now,
    );
  }
  if (patch.history?.length) {
    add(
      `DELETE FROM profile_history WHERE profile_id = ? AND (entity_kind, entity_key) NOT IN (
         SELECT entity_kind, entity_key FROM profile_history WHERE profile_id = ? ORDER BY viewed_at DESC LIMIT 50)`,
      profileId, profileId,
    );
  }
  add('UPDATE profiles SET updated_at = ? WHERE id = ?', now, profileId);
  return out;
}

export async function applyPatch(profiles: ProfileDb, profileId: string, patch: ProgressPatch): Promise<void> {
  const current = patch.settings ? await readSettings(profiles, profileId) : DEFAULT_SETTINGS;
  await profiles.batch(patchStatements(profileId, patch, current), 'write');
}

export function exportProfile(progress: ProfileProgress, datasetVersion: string): ProfileExport {
  return {
    format: PROFILE_EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    datasetVersion,
    profile: { name: progress.name },
    settings: progress.settings,
    unlocks: Object.entries(progress.unlocks).map(([id, status]) => ({ achievementId: Number(id), status })),
    marks: Object.entries(progress.marks).flatMap(([characterSlug, m]) =>
      Object.entries(m).map(([markKey, difficulty]) => ({ characterSlug, markKey: markKey as ProfileExport['marks'][number]['markKey'], difficulty: difficulty! })),
    ),
    favorites: progress.favorites,
    donations: progress.donations,
    items: Object.entries(progress.items).map(([k, status]) => {
      const [kind, key] = k.split(':') as ['item' | 'trinket', string];
      return { kind, key, status };
    }),
  };
}

/** Instructions de création d'un profil (profil + paramètres par défaut + premier jeton). */
function createProfileStatements(name: string, password?: string): { id: string; token: string; statements: InStatement[] } {
  const id = newProfileId();
  const token = newToken();
  const now = new Date().toISOString();
  return {
    id,
    token,
    statements: [
      {
        sql: 'INSERT INTO profiles (id, name, name_key, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?)',
        args: [id, name.trim(), nameKey(name), password ? hashPassword(password) : null, now, now],
      },
      { sql: 'INSERT INTO profile_settings (profile_id, settings) VALUES (?, ?)', args: [id, JSON.stringify(DEFAULT_SETTINGS)] },
      ...issueTokenStatements(id, token),
    ],
  };
}

async function runCreate(profiles: ProfileDb, statements: InStatement[]): Promise<void> {
  try {
    await profiles.batch(statements, 'write');
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, 'NAME_TAKEN', 'Ce nom de profil est déjà utilisé');
    throw e;
  }
}

export async function profileRoutes(app: FastifyInstance, ctx: AppContext) {
  const { profiles } = ctx;
  const idParam = z.object({ id: z.string().uuid() });
  const strict = { config: { rateLimit: { max: ctx.config.authRateLimitMax, timeWindow: '15 minutes' } } };

  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api/profiles')) reply.header('Cache-Control', 'no-store');
  });

  app.post('/api/profiles', strict, async (req, reply) => {
    if (!ctx.config.allowProfileCreation) throw new AppError(403, 'CREATION_DISABLED', 'La création de profils est désactivée sur cette instance');
    const body = parse(createProfileBody, req.body);
    const { id, token, statements } = createProfileStatements(body.name, body.password);
    await runCreate(profiles, statements);
    reply.status(201);
    return { profile: { id, name: body.name.trim(), hasPassword: !!body.password }, token };
  });

  app.post('/api/profiles/login', strict, async (req) => {
    const body = parse(loginBody, req.body);
    const row = (await profiles.execute({ sql: 'SELECT id, name, password_hash FROM profiles WHERE name_key = ?', args: [nameKey(body.name)] })).rows[0];
    // Vérification systématique (même sans profil) pour limiter les attaques par mesure du temps.
    const ok = verifyPassword(body.password, (row?.password_hash as string | null) ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    if (!row || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Nom de profil ou mot de passe incorrect');
    return { profile: { id: row.id, name: row.name, hasPassword: true }, token: await issueToken(profiles, row.id as string) };
  });

  app.get('/api/profiles/me', async (req) => {
    const id = await requireProfile(profiles, req);
    const p = await loadProgress(profiles, id);
    return { profile: { id, name: p.name, hasPassword: p.hasPassword } };
  });

  app.patch('/api/profiles/:id', strict, async (req) => {
    const { id } = parse(idParam, req.params);
    await requireProfile(profiles, req, id);
    const body = parse(updateProfileBody, req.body);
    const row = (await profiles.execute({ sql: 'SELECT password_hash FROM profiles WHERE id = ?', args: [id] })).rows[0];
    if (!row) throw notFound('Profil');
    if (body.password !== undefined && row.password_hash && !verifyPassword(body.currentPassword ?? '', row.password_hash as string)) {
      throw new AppError(403, 'WRONG_PASSWORD', 'Mot de passe actuel incorrect');
    }
    const now = new Date().toISOString();
    const statements: InStatement[] = [];
    if (body.name) statements.push({ sql: 'UPDATE profiles SET name = ?, name_key = ?, updated_at = ? WHERE id = ?', args: [body.name.trim(), nameKey(body.name), now, id] });
    if (body.password !== undefined) {
      statements.push({ sql: 'UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?', args: [body.password ? hashPassword(body.password) : null, now, id] });
    }
    if (statements.length) {
      try {
        await profiles.batch(statements, 'write');
      } catch (e) {
        if (isUniqueViolation(e)) throw new AppError(409, 'NAME_TAKEN', 'Ce nom de profil est déjà utilisé');
        throw e;
      }
    }
    const p = await loadProgress(profiles, id);
    return { profile: { id, name: p.name, hasPassword: p.hasPassword } };
  });

  app.delete('/api/profiles/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    await requireProfile(profiles, req, id);
    await profiles.batch(
      [...PROFILE_CHILD_TABLES.map((t) => ({ sql: `DELETE FROM ${t} WHERE profile_id = ?`, args: [id] })), { sql: 'DELETE FROM profiles WHERE id = ?', args: [id] }],
      'write',
    );
    reply.status(204);
  });

  app.post('/api/profiles/:id/logout', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    await requireProfile(profiles, req, id);
    await revokeToken(profiles, req);
    reply.status(204);
  });

  app.get('/api/profiles/:id/progress', async (req) => {
    const { id } = parse(idParam, req.params);
    await requireProfile(profiles, req, id);
    return loadProgress(profiles, id);
  });

  app.patch('/api/profiles/:id/progress', async (req) => {
    const { id } = parse(idParam, req.params);
    await requireProfile(profiles, req, id);
    const patch = parse(progressPatch, req.body);
    const store = ctx.store();
    for (const u of patch.unlocks ?? []) if (!store.byId.achievement.has(u.achievementId)) throw badRequest(`Succès inconnu : ${u.achievementId}`);
    for (const m of patch.marks ?? []) if (!store.byId.character.has(m.characterSlug)) throw badRequest(`Personnage inconnu : ${m.characterSlug}`);
    await applyPatch(profiles, id, patch);
    return loadProgress(profiles, id);
  });

  app.get('/api/profiles/:id/stats', async (req) => {
    const { id } = parse(idParam, req.params);
    await requireProfile(profiles, req, id);
    const progress = await loadProgress(profiles, id);
    const bit = versionBit(progress.settings.gameVersion as VersionKey);
    const store = ctx.store();
    const statuses = computeStatuses(store, progress, bit);
    return {
      stats: computeStats(store, progress, bit),
      statuses: Object.fromEntries(statuses),
      paths: store.plannerPaths.map((p) => pathProgress(p, statuses)),
    };
  });

  app.get('/api/profiles/:id/recommendations', async (req) => {
    const { id } = parse(idParam, req.params);
    await requireProfile(profiles, req, id);
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(50).default(12), character: z.string().max(64).optional() }), req.query);
    const progress = await loadProgress(profiles, id);
    const store = ctx.store();
    const bit = versionBit(progress.settings.gameVersion as VersionKey);
    const recs = recommend({ ...store, synergyCounts: store.synergyCounts }, progress, bit, { limit: q.limit, characterSlug: q.character ?? null });
    return {
      recommendations: recs.map((r) => ({ ...r, achievement: store.byId.achievement.get(r.achievementId) })),
      disclaimer: 'Recommandations indicatives fondées sur votre progression déclarée ; aucun résultat soumis au hasard ne peut être garanti.',
    };
  });

  app.post('/api/profiles/:id/export', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    await requireProfile(profiles, req, id);
    const progress = await loadProgress(profiles, id);
    const data = exportProfile(progress, ctx.store().meta.datasetVersion);
    const safeName = progress.name.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 30) || 'profil';
    reply.header('Content-Disposition', `attachment; filename="isaac-codex-${safeName}-${data.exportedAt.slice(0, 10)}.json"`);
    return data;
  });

  app.post('/api/profiles/import', { ...strict, bodyLimit: 2_000_000 }, async (req, reply) => {
    const body = parse(importBody, req.body);
    const store = ctx.store();
    const data = body.data;
    // Les références inconnues (version différente du jeu de données) sont ignorées et signalées.
    const unlocks = data.unlocks.filter((u) => store.byId.achievement.has(u.achievementId));
    const marks = data.marks.filter((m) => store.byId.character.has(m.characterSlug));
    const skipped = data.unlocks.length - unlocks.length + (data.marks.length - marks.length);
    const patch: ProgressPatch = {
      unlocks: unlocks.map((u) => ({ achievementId: u.achievementId, status: u.status })),
      marks: marks.map((m) => ({ characterSlug: m.characterSlug, markKey: m.markKey, difficulty: m.difficulty })),
      favorites: data.favorites.map((f) => ({ ...f, favorite: true })),
      donations: data.donations,
      items: data.items,
      settings: data.settings,
    };

    let profileId: string;
    let token: string | null = null;
    if (body.mode === 'replace') {
      profileId = await requireProfile(profiles, req);
      const current = await readSettings(profiles, profileId);
      // Effacement + import dans un même lot : en cas d'échec, l'ancienne progression est conservée.
      await profiles.batch(
        [
          ...['profile_unlocks', 'profile_completion_marks', 'profile_favorites', 'profile_donations', 'profile_items'].map((t) => ({
            sql: `DELETE FROM ${t} WHERE profile_id = ?`,
            args: [profileId],
          })),
          ...patchStatements(profileId, patch, current),
        ],
        'write',
      );
    } else {
      if (!ctx.config.allowProfileCreation) throw new AppError(403, 'CREATION_DISABLED', 'La création de profils est désactivée sur cette instance');
      const base = (body.name ?? data.profile.name).trim();
      let name = base;
      const taken = async (n: string) => (await profiles.execute({ sql: 'SELECT 1 FROM profiles WHERE name_key = ?', args: [nameKey(n)] })).rows.length > 0;
      for (let i = 2; (await taken(name)) && i < 100; i++) name = `${base.slice(0, 34)} (${i})`;
      const created = createProfileStatements(name, body.password);
      profileId = created.id;
      token = created.token;
      // Création + import atomiques : pas de profil à moitié importé.
      await runCreate(profiles, [...created.statements, ...patchStatements(profileId, patch, DEFAULT_SETTINGS)]);
    }
    reply.status(body.mode === 'new' ? 201 : 200);
    const progress = await loadProgress(profiles, profileId);
    return {
      profile: { id: profileId, name: progress.name, hasPassword: progress.hasPassword },
      token,
      imported: { unlocks: unlocks.length, marks: marks.length, favorites: data.favorites.length, items: data.items.length },
      skipped,
      datasetMismatch: data.datasetVersion !== store.meta.datasetVersion,
    };
  });
}
