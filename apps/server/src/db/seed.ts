/**
 * Import du jeu de données (packages/game-data/generated/dataset.json) dans les tables « jeu ».
 * Idempotent : ne fait rien si la version du jeu de données est déjà importée (sauf `force`).
 * Les tables de profils ne sont jamais modifiées.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { dataset as datasetSchema, type Dataset, VERSIONS } from '@isaac-codex/shared';
import type { DbHandle } from './client.js';

export function datasetPath(rootDir: string): string {
  return path.join(rootDir, 'packages/game-data/generated/dataset.json');
}

const GAME_TABLES_IN_DELETE_ORDER = [
  'character_unlock_marks', 'character_unlocks', 'donation_milestones', 'unlock_dependencies', 'unlock_conditions',
  'guide_steps', 'guides', 'transformation_requirements', 'transformations', 'item_synergies', 'item_pool_entries',
  'item_tags', 'item_pools', 'character_starting_items', 'character_stats', 'characters', 'challenges', 'achievements',
  'items', 'trinkets', 'consumables', 'completion_marks', 'bosses', 'floors', 'floor_routes', 'planner_paths', 'tips',
  'game_versions',
];

export function currentDatasetVersion(handle: DbHandle): string | null {
  const row = handle.sqlite.prepare(`SELECT value FROM app_meta WHERE key = 'dataset_version'`).get() as { value: string } | undefined;
  return row?.value ?? null;
}

export function loadDatasetFile(file: string): Dataset {
  if (!existsSync(file)) throw new Error(`Jeu de données introuvable : ${file}. Exécutez « npm run data:build ».`);
  const parsed = datasetSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) throw new Error(`Jeu de données invalide : ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join(' ; ')}`);
  return parsed.data;
}

export function seedGameData(handle: DbHandle, data: Dataset, opts: { force?: boolean } = {}): { seeded: boolean; version: string } {
  const version = data.meta.datasetVersion;
  if (!opts.force && currentDatasetVersion(handle) === version) return { seeded: false, version };
  const db = handle.sqlite;
  const now = new Date().toISOString();
  const json = (v: unknown) => JSON.stringify(v);
  const src = (s: { page: string | null; revid: number | null; verifiedAt: string; confidence: string }) => [s.page, s.revid, s.verifiedAt, s.confidence];

  db.transaction(() => {
    for (const t of GAME_TABLES_IN_DELETE_ORDER) db.prepare(`DELETE FROM ${t}`).run();

    const ver = db.prepare('INSERT INTO game_versions (key, bit, label, sort) VALUES (?, ?, ?, ?)');
    VERSIONS.forEach((v, i) => ver.run(v.key, v.bit, v.label, i));

    for (const s of data.meta.sources) {
      db.prepare('INSERT INTO sources (name, url, license, license_url, fetched_at, method, dataset_version, imported_at) VALUES (?,?,?,?,?,?,?,?)').run(
        s.name, s.url, s.license, s.licenseUrl, s.fetchedAt, s.method, version, now,
      );
    }

    const ach = db.prepare(
      `INSERT INTO achievements (id, name, description, requirement, requirement_text, mask, kind, character_slug, coins, challenge_number,
        reward_kind, reward_key, reward_label, difficulty, source_page, source_revid, verified_at, confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const cond = db.prepare('INSERT INTO unlock_conditions (achievement_id, kind, character_slug, coins, challenge_number, text) VALUES (?,?,?,?,?,?)');
    for (const a of data.achievements) {
      ach.run(a.id, a.name, a.description, a.requirement, a.requirementText, a.mask, a.kind, a.characterSlug, a.coins, a.challengeNumber,
        a.reward.kind, a.reward.key, a.reward.label, a.difficulty, ...src(a.source));
      cond.run(a.id, a.kind, a.characterSlug, a.coins, a.challengeNumber, a.requirementText);
    }
    const dep = db.prepare('INSERT OR IGNORE INTO unlock_dependencies (achievement_id, requires_id) VALUES (?, ?)');
    for (const a of data.achievements) for (const p of a.prerequisites) dep.run(a.id, p);

    const item = db.prepare(
      `INSERT INTO items (id, slug, kind, familiar, name_en, name_fr, quote, description, quality, quality_rep_plus, recharge,
        unlock_achievement_id, mask, effects, notes, source_page, source_revid, verified_at, confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const tag = db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag) VALUES (?, ?)');
    const poolEntry = db.prepare('INSERT OR REPLACE INTO item_pool_entries (item_id, pool_key, weight, mask) VALUES (?,?,?,?)');
    for (const i of data.items) {
      item.run(i.id, i.slug, i.kind, i.familiar ? 1 : 0, i.nameEn, i.nameFr, i.quote, i.description, i.quality, i.qualityRepPlus, i.recharge,
        i.unlockAchievementId, i.mask, i.effects, i.notes, ...src(i.source));
      for (const t of i.tags) tag.run(i.id, t);
      for (const p of i.pools) poolEntry.run(i.id, p.pool, p.weight, p.mask);
    }
    const pool = db.prepare('INSERT INTO item_pools (key, name_en, name_fr, greed, mask) VALUES (?,?,?,?,?)');
    for (const p of data.pools) pool.run(p.key, p.nameEn, p.nameFr, p.greed ? 1 : 0, p.mask);

    const trk = db.prepare(
      `INSERT INTO trinkets (id, slug, name_en, name_fr, quote, description, tags, unlock_achievement_id, mask, effects, notes, source_page, source_revid, verified_at, confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const t of data.trinkets) trk.run(t.id, t.slug, t.nameEn, t.nameFr, t.quote, t.description, json(t.tags), t.unlockAchievementId, t.mask, t.effects, t.notes, ...src(t.source));

    const cons = db.prepare(
      `INSERT INTO consumables (slug, game_id, kind, name_en, name_fr, quote, description, horse_effect, polarity, unlock_achievement_id, mask, effects, notes, source_page, source_revid, verified_at, confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const c of data.consumables) cons.run(c.slug, c.gameId, c.kind, c.nameEn, c.nameFr, c.quote, c.description, c.horseEffect, c.polarity, c.unlockAchievementId, c.mask, c.effects, c.notes, ...src(c.source));

    const ch = db.prepare(
      `INSERT INTO characters (slug, name_en, name_fr, tainted, base_slug, sort, forms, pickups, starting_text, unlock_achievement_id, mask, notes, strategy, editorial, source_page, source_revid, verified_at, confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const stats = db.prepare('INSERT INTO character_stats (character_slug, health, damage, tears, speed, range, shot_speed, luck) VALUES (?,?,?,?,?,?,?,?)');
    const start = db.prepare('INSERT OR IGNORE INTO character_starting_items (character_slug, entity_kind, entity_key, sort) VALUES (?,?,?,?)');
    for (const c of data.characters) {
      ch.run(c.slug, c.nameEn, c.nameFr, c.tainted ? 1 : 0, c.baseSlug, c.order, json(c.forms), c.pickups, c.startingText, c.unlockAchievementId, c.mask, c.notes, c.strategy,
        c.editorial ? json(c.editorial) : null, ...src(c.source));
      stats.run(c.slug, json(c.health), c.stats.damage, c.stats.tears, c.stats.speed, c.stats.range, c.stats.shotSpeed, c.stats.luck);
      c.startingItems.forEach((s, i) => start.run(c.slug, s.kind, s.key, i));
    }

    const mark = db.prepare('INSERT INTO completion_marks (key, sort, name_fr, name_en, boss, hard_label_fr, mask, description, access_achievement_ids) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const m of data.completionMarks) mark.run(m.key, m.order, m.nameFr, m.nameEn, m.boss, m.hardLabelFr, m.mask, m.description, json(m.accessAchievementIds));
    const cu = db.prepare('INSERT INTO character_unlocks (achievement_id, character_slug, hard) VALUES (?,?,?)');
    const cum = db.prepare('INSERT INTO character_unlock_marks (achievement_id, mark_key) VALUES (?,?)');
    for (const u of data.markUnlocks) {
      cu.run(u.achievementId, u.characterSlug, u.hard ? 1 : 0);
      for (const m of u.marks) cum.run(u.achievementId, m);
    }

    const dono = db.prepare('INSERT INTO donation_milestones (machine, coins, achievement_id, label) VALUES (?,?,?,?)');
    for (const d of data.donationMilestones) dono.run(d.machine, d.coins, d.achievementId, d.label);

    const chal = db.prepare(
      `INSERT INTO challenges (number, slug, name, goal, description, character_slug, unlock_achievement_id, reward_achievement_id, mask, source_page, source_revid, verified_at, confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const c of data.challenges) chal.run(c.number, c.slug, c.name, c.goal, c.description, c.character, c.unlockAchievementId, c.rewardAchievementId, c.mask, ...src(c.source));

    const tr = db.prepare(
      `INSERT INTO transformations (slug, id, name_en, name_fr, description, requirement, members_text, mask, source_page, source_revid, verified_at, confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const trm = db.prepare('INSERT OR IGNORE INTO transformation_requirements (transformation_slug, entity_kind, entity_key) VALUES (?,?,?)');
    for (const t of data.transformations) {
      tr.run(t.slug, t.id, t.nameEn, t.nameFr, t.description, t.requirement, t.membersText, t.mask, ...src(t.source));
      for (const m of t.members) trm.run(t.slug, m.kind, m.key);
    }

    const syn = db.prepare(
      `INSERT INTO item_synergies (a_kind, a_key, b_kind, b_key, section, text, possibly_negative, mask, source_page, source_revid, verified_at, confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const s of data.synergies) syn.run(s.a.kind, s.a.key, s.b.kind, s.b.key, s.section, s.text, s.possiblyNegative ? 1 : 0, s.mask, ...src(s.source));

    const boss = db.prepare(
      `INSERT INTO bosses (slug, name_en, name_fr, type, entity_id, variant, hp, floors, rewards, behavior, notes, strategy, unlock_achievement_id, mask, source_page, source_revid, verified_at, confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const b of data.bosses) boss.run(b.slug, b.nameEn, b.nameFr, b.type, b.entityId, b.variant, b.hp, json(b.floors), b.rewards, b.behavior, b.notes, b.strategy, b.unlockAchievementId, b.mask, ...src(b.source));

    const fl = db.prepare(
      `INSERT INTO floors (slug, name_en, name_fr, chapter, alternate, mask, unlock_achievement_id, bosses, source_page, source_revid, verified_at, confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const f of data.floors) fl.run(f.slug, f.nameEn, f.nameFr, f.chapter, f.alternate ? 1 : 0, f.mask, f.unlockAchievementId, json(f.bosses), ...src(f.source));

    const route = db.prepare('INSERT INTO floor_routes (slug, sort, data) VALUES (?,?,?)');
    data.routes.forEach((r, i) => route.run(r.slug, i, json(r)));

    const guide = db.prepare('INSERT INTO guides (slug, title, category, level, priority, summary, data) VALUES (?,?,?,?,?,?,?)');
    const step = db.prepare('INSERT INTO guide_steps (guide_slug, step_index, title, body) VALUES (?,?,?,?)');
    for (const g of data.guides) {
      const { steps, ...rest } = g;
      guide.run(g.slug, g.title, g.category, g.level, g.priority, g.summary, json(rest));
      steps.forEach((s, i) => step.run(g.slug, i, s.title, s.body));
    }
    const path_ = db.prepare('INSERT INTO planner_paths (slug, sort, data) VALUES (?,?,?)');
    data.plannerPaths.forEach((p, i) => path_.run(p.slug, i, json(p)));
    const tip = db.prepare('INSERT INTO tips (text, source) VALUES (?,?)');
    for (const t of data.tips) tip.run(t.text, t.source);

    const meta = db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    meta.run('dataset_version', version);
    meta.run('dataset_built_at', data.meta.builtAt);
    meta.run('dataset_counts', json(data.meta.counts));
    meta.run('dataset_sources', json(data.meta.sources));
    meta.run('dataset_seeded_at', now);
  })();

  return { seeded: true, version };
}
