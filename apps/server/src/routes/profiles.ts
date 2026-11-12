/**
 * Profils locaux, progression, export/import.
 * Toutes les routes /api/profiles/:id/* exigent un jeton valide pour ce profil précis.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DEFAULT_SETTINGS, PROFILE_EXPORT_FORMAT, createProfileBody, importBody, loginBody, profileSettings, progressPatch, updateProfileBody,
  computeStats, recommend, pathProgress, computeStatuses, versionBit,
  type EntityRef, type ProfileExport, type ProfileProgress, type ProfileSettings, type ProgressPatch, type VersionKey,
} from '@isaac-codex/shared';
import type { AppContext } from '../app.js';
import type { DbHandle } from '../db/client.js';
import { AppError, badRequest, notFound, parse } from '../lib/errors.js';
import { hashPassword, issueToken, newProfileId, requireProfile, revokeToken, verifyPassword } from '../lib/auth.js';

type Row = Record<string, unknown>;
const nameKey = (name: string) => name.trim().toLocaleLowerCase('fr').normalize('NFKC');

function readSettings(handle: DbHandle, profileId: string): ProfileSettings {
  const row = handle.sqlite.prepare('SELECT settings FROM profile_settings WHERE profile_id = ?').get(profileId) as { settings: string } | undefined;
  const parsed = profileSettings.safeParse(row ? JSON.parse(row.settings) : {});
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export function loadProgress(handle: DbHandle, profileId: string): ProfileProgress {
  const db = handle.sqlite;
  const profile = db.prepare('SELECT id, name, password_hash FROM profiles WHERE id = ?').get(profileId) as Row | undefined;
  if (!profile) throw notFound('Profil');
  const unlocks: ProfileProgress['unlocks'] = {};
  for (const r of db.prepare('SELECT achievement_id, status FROM profile_unlocks WHERE profile_id = ?').all(profileId) as Row[]) {
    unlocks[r.achievement_id as number] = r.status as ProfileProgress['unlocks'][number];
  }
  const marks: ProfileProgress['marks'] = {};
  for (const r of db.prepare('SELECT character_slug, mark_key, difficulty FROM profile_completion_marks WHERE profile_id = ?').all(profileId) as Row[]) {
    const slug = r.character_slug as string;
    marks[slug] ??= {};
    marks[slug]![r.mark_key as keyof ProfileProgress['marks'][string]] = r.difficulty as 'normal' | 'hard';
  }
  const donations = { donation: 0, greed: 0 };
  for (const r of db.prepare('SELECT machine, coins FROM profile_donations WHERE profile_id = ?').all(profileId) as Row[]) {
    if (r.machine === 'donation' || r.machine === 'greed') donations[r.machine] = r.coins as number;
  }
  const items: ProfileProgress['items'] = {};
  for (const r of db.prepare('SELECT entity_kind, entity_key, status FROM profile_items WHERE profile_id = ?').all(profileId) as Row[]) {
    items[`${r.entity_kind}:${r.entity_key}`] = r.status as 'seen' | 'collected';
  }
  return {
    profileId,
    name: profile.name as string,
    hasPassword: !!profile.password_hash,
    settings: readSettings(handle, profileId),
    unlocks,
    marks,
    favorites: (db.prepare('SELECT entity_kind, entity_key FROM profile_favorites WHERE profile_id = ? ORDER BY created_at DESC').all(profileId) as Row[]).map(
      (r) => ({ kind: r.entity_kind as EntityRef['kind'], key: r.entity_key as string }),
    ),
    donations,
    items,
    history: (
      db.prepare('SELECT entity_kind, entity_key, viewed_at FROM profile_history WHERE profile_id = ? ORDER BY viewed_at DESC LIMIT 20').all(profileId) as Row[]
    ).map((r) => ({ kind: r.entity_kind as EntityRef['kind'], key: r.entity_key as string, viewedAt: r.viewed_at as string })),
  };
}

export function applyPatch(handle: DbHandle, profileId: string, patch: ProgressPatch) {
  const db = handle.sqlite;
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const u of patch.unlocks ?? []) {
      if (u.status === null) db.prepare('DELETE FROM profile_unlocks WHERE profile_id = ? AND achievement_id = ?').run(profileId, u.achievementId);
      else
        db.prepare(
          `INSERT INTO profile_unlocks (profile_id, achievement_id, status, updated_at) VALUES (?,?,?,?)
           ON CONFLICT(profile_id, achievement_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        ).run(profileId, u.achievementId, u.status, now);
    }
    for (const m of patch.marks ?? []) {
      if (m.difficulty === null) db.prepare('DELETE FROM profile_completion_marks WHERE profile_id = ? AND character_slug = ? AND mark_key = ?').run(profileId, m.characterSlug, m.markKey);
      else
        db.prepare(
          `INSERT INTO profile_completion_marks (profile_id, character_slug, mark_key, difficulty, updated_at) VALUES (?,?,?,?,?)
           ON CONFLICT(profile_id, character_slug, mark_key) DO UPDATE SET difficulty = excluded.difficulty, updated_at = excluded.updated_at`,
        ).run(profileId, m.characterSlug, m.markKey, m.difficulty, now);
    }
    for (const f of patch.favorites ?? []) {
      if (f.favorite) db.prepare('INSERT OR IGNORE INTO profile_favorites (profile_id, entity_kind, entity_key, created_at) VALUES (?,?,?,?)').run(profileId, f.kind, f.key, now);
      else db.prepare('DELETE FROM profile_favorites WHERE profile_id = ? AND entity_kind = ? AND entity_key = ?').run(profileId, f.kind, f.key);
    }
    if (patch.donations) {
      for (const [machine, coins] of Object.entries(patch.donations)) {
        if (coins === undefined) continue;
        db.prepare(
          `INSERT INTO profile_donations (profile_id, machine, coins, updated_at) VALUES (?,?,?,?)
           ON CONFLICT(profile_id, machine) DO UPDATE SET coins = excluded.coins, updated_at = excluded.updated_at`,
        ).run(profileId, machine, coins, now);
      }
    }
    for (const i of patch.items ?? []) {
      if (i.status === null) db.prepare('DELETE FROM profile_items WHERE profile_id = ? AND entity_kind = ? AND entity_key = ?').run(profileId, i.kind, i.key);
      else
        db.prepare(
          `INSERT INTO profile_items (profile_id, entity_kind, entity_key, status, updated_at) VALUES (?,?,?,?,?)
           ON CONFLICT(profile_id, entity_kind, entity_key) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        ).run(profileId, i.kind, i.key, i.status, now);
    }
    if (patch.settings) {
      const merged = profileSettings.parse({ ...readSettings(handle, profileId), ...patch.settings });
      db.prepare(
        `INSERT INTO profile_settings (profile_id, settings) VALUES (?, ?) ON CONFLICT(profile_id) DO UPDATE SET settings = excluded.settings`,
      ).run(profileId, JSON.stringify(merged));
    }
    for (const h of patch.history ?? []) {
      db.prepare(
        `INSERT INTO profile_history (profile_id, entity_kind, entity_key, viewed_at) VALUES (?,?,?,?)
         ON CONFLICT(profile_id, entity_kind, entity_key) DO UPDATE SET viewed_at = excluded.viewed_at`,
      ).run(profileId, h.kind, h.key, now);
    }
    if (patch.history?.length) {
      db.prepare(
        `DELETE FROM profile_history WHERE profile_id = ? AND (entity_kind, entity_key) NOT IN (
           SELECT entity_kind, entity_key FROM profile_history WHERE profile_id = ? ORDER BY viewed_at DESC LIMIT 50)`,
      ).run(profileId, profileId);
    }
    db.prepare('UPDATE profiles SET updated_at = ? WHERE id = ?').run(now, profileId);
  })();
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

function createProfile(handle: DbHandle, name: string, password?: string): { id: string; token: string } {
  const id = newProfileId();
  const now = new Date().toISOString();
  try {
    handle.sqlite
      .prepare('INSERT INTO profiles (id, name, name_key, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run(id, name.trim(), nameKey(name), password ? hashPassword(password) : null, now, now);
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new AppError(409, 'NAME_TAKEN', 'Ce nom de profil est déjà utilisé');
    throw e;
  }
  handle.sqlite.prepare('INSERT INTO profile_settings (profile_id, settings) VALUES (?, ?)').run(id, JSON.stringify(DEFAULT_SETTINGS));
  return { id, token: issueToken(handle, id) };
}

export async function profileRoutes(app: FastifyInstance, ctx: AppContext) {
  const { handle } = ctx;
  const idParam = z.object({ id: z.string().uuid() });
  const strict = { config: { rateLimit: { max: ctx.config.authRateLimitMax, timeWindow: '15 minutes' } } };

  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api/profiles')) reply.header('Cache-Control', 'no-store');
  });

  app.post('/api/profiles', strict, async (req, reply) => {
    if (!ctx.config.allowProfileCreation) throw new AppError(403, 'CREATION_DISABLED', 'La création de profils est désactivée sur cette instance');
    const body = parse(createProfileBody, req.body);
    const { id, token } = createProfile(handle, body.name, body.password);
    reply.status(201);
    return { profile: { id, name: body.name.trim(), hasPassword: !!body.password }, token };
  });

  app.post('/api/profiles/login', strict, async (req) => {
    const body = parse(loginBody, req.body);
    const row = handle.sqlite.prepare('SELECT id, name, password_hash FROM profiles WHERE name_key = ?').get(nameKey(body.name)) as Row | undefined;
    // Vérification systématique (même sans profil) pour limiter les attaques par mesure du temps.
    const ok = verifyPassword(body.password, (row?.password_hash as string | null) ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    if (!row || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Nom de profil ou mot de passe incorrect');
    return { profile: { id: row.id, name: row.name, hasPassword: true }, token: issueToken(handle, row.id as string) };
  });

  app.get('/api/profiles/me', async (req) => {
    const id = requireProfile(handle, req);
    const p = loadProgress(handle, id);
    return { profile: { id, name: p.name, hasPassword: p.hasPassword } };
  });

  app.patch('/api/profiles/:id', strict, async (req) => {
    const { id } = parse(idParam, req.params);
    requireProfile(handle, req, id);
    const body = parse(updateProfileBody, req.body);
    const row = handle.sqlite.prepare('SELECT password_hash FROM profiles WHERE id = ?').get(id) as Row;
    if (body.password !== undefined && row.password_hash && !verifyPassword(body.currentPassword ?? '', row.password_hash as string)) {
      throw new AppError(403, 'WRONG_PASSWORD', 'Mot de passe actuel incorrect');
    }
    const now = new Date().toISOString();
    try {
      if (body.name) handle.sqlite.prepare('UPDATE profiles SET name = ?, name_key = ?, updated_at = ? WHERE id = ?').run(body.name.trim(), nameKey(body.name), now, id);
    } catch (e) {
      if (String(e).includes('UNIQUE')) throw new AppError(409, 'NAME_TAKEN', 'Ce nom de profil est déjà utilisé');
      throw e;
    }
    if (body.password !== undefined) {
      handle.sqlite.prepare('UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?').run(body.password ? hashPassword(body.password) : null, now, id);
    }
    const p = loadProgress(handle, id);
    return { profile: { id, name: p.name, hasPassword: p.hasPassword } };
  });

  app.delete('/api/profiles/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    requireProfile(handle, req, id);
    handle.sqlite.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    reply.status(204);
  });

  app.post('/api/profiles/:id/logout', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    requireProfile(handle, req, id);
    revokeToken(handle, req);
    reply.status(204);
  });

  app.get('/api/profiles/:id/progress', async (req) => {
    const { id } = parse(idParam, req.params);
    requireProfile(handle, req, id);
    return loadProgress(handle, id);
  });

  app.patch('/api/profiles/:id/progress', async (req) => {
    const { id } = parse(idParam, req.params);
    requireProfile(handle, req, id);
    const patch = parse(progressPatch, req.body);
    const store = ctx.store();
    for (const u of patch.unlocks ?? []) if (!store.byId.achievement.has(u.achievementId)) throw badRequest(`Succès inconnu : ${u.achievementId}`);
    for (const m of patch.marks ?? []) if (!store.byId.character.has(m.characterSlug)) throw badRequest(`Personnage inconnu : ${m.characterSlug}`);
    applyPatch(handle, id, patch);
    return loadProgress(handle, id);
  });

  app.get('/api/profiles/:id/stats', async (req) => {
    const { id } = parse(idParam, req.params);
    requireProfile(handle, req, id);
    const progress = loadProgress(handle, id);
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
    requireProfile(handle, req, id);
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(50).default(12), character: z.string().max(64).optional() }), req.query);
    const progress = loadProgress(handle, id);
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
    requireProfile(handle, req, id);
    const progress = loadProgress(handle, id);
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

    let profileId: string;
    let token: string | null = null;
    if (body.mode === 'replace') {
      profileId = requireProfile(handle, req);
      handle.sqlite.transaction(() => {
        for (const t of ['profile_unlocks', 'profile_completion_marks', 'profile_favorites', 'profile_donations', 'profile_items']) {
          handle.sqlite.prepare(`DELETE FROM ${t} WHERE profile_id = ?`).run(profileId);
        }
      })();
    } else {
      if (!ctx.config.allowProfileCreation) throw new AppError(403, 'CREATION_DISABLED', 'La création de profils est désactivée sur cette instance');
      let name = (body.name ?? data.profile.name).trim();
      const taken = (n: string) => !!handle.sqlite.prepare('SELECT 1 FROM profiles WHERE name_key = ?').get(nameKey(n));
      for (let i = 2; taken(name) && i < 100; i++) name = `${(body.name ?? data.profile.name).trim().slice(0, 34)} (${i})`;
      const created = createProfile(handle, name, body.password);
      profileId = created.id;
      token = created.token;
    }
    applyPatch(handle, profileId, {
      unlocks: unlocks.map((u) => ({ achievementId: u.achievementId, status: u.status })),
      marks: marks.map((m) => ({ characterSlug: m.characterSlug, markKey: m.markKey, difficulty: m.difficulty })),
      favorites: data.favorites.map((f) => ({ ...f, favorite: true })),
      donations: data.donations,
      items: data.items,
      settings: data.settings,
    });
    reply.status(body.mode === 'new' ? 201 : 200);
    const progress = loadProgress(handle, profileId);
    return {
      profile: { id: profileId, name: progress.name, hasPassword: progress.hasPassword },
      token,
      imported: { unlocks: unlocks.length, marks: marks.length, favorites: data.favorites.length, items: data.items.length },
      skipped,
      datasetMismatch: data.datasetVersion !== store.meta.datasetVersion,
    };
  });
}
