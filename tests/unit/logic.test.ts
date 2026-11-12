/** Progression, recommandations et simulateur, testés sur le VRAI jeu de données généré. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  analyzeBuild, computeStats, computeStatuses, dataset as datasetSchema, emptyProgress, nextMilestone, parseStatMods, pathProgress,
  recommend, type Dataset, type ProfileProgress,
} from '@isaac-codex/shared';

let data: Dataset;
const REP = 8;
const id = (name: string) => data.achievements.find((a) => a.name === name)!.id;
const fresh = (): ProfileProgress => emptyProgress('test', 'Test');

beforeAll(() => {
  data = datasetSchema.parse(JSON.parse(readFileSync(path.resolve('packages/game-data/generated/dataset.json'), 'utf8')));
});

describe('jeu de données', () => {
  it('contient les volumes attendus', () => {
    expect(data.items.length).toBeGreaterThanOrEqual(700);
    expect(data.characters).toHaveLength(34);
    expect(data.achievements).toHaveLength(641);
    expect(new Set(data.items.map((i) => i.id)).size).toBe(data.items.length);
  });
  it('associe chaque personnage normal à 13 déblocages de marques et chaque Tainted à 7', () => {
    for (const c of data.characters) {
      expect(data.markUnlocks.filter((m) => m.characterSlug === c.slug)).toHaveLength(c.tainted ? 7 : 13);
    }
  });
  it('connaît les faits de référence vérifiés', () => {
    const d6 = data.achievements.find((a) => a.name === 'The D6')!;
    expect(d6.requirementText).toBe('Defeat Isaac as ???');
    expect(data.items.find((i) => i.id === 105)!.unlockAchievementId).toBe(d6.id);
    expect(data.donationMilestones.find((m) => m.machine === 'greed' && m.coins === 1000)!.label).toBe('Keeper');
  });
});

describe('progression', () => {
  it('déduit un succès des marques (The Lamb avec Isaac → Missing Poster)', () => {
    const p = fresh();
    p.marks.isaac = { lamb: 'normal' };
    expect(computeStatuses(data, p, REP).get(id('Missing Poster'))).toBe('unlocked');
  });
  it('exige le mode difficile pour les bébés coopératifs', () => {
    const p = fresh();
    p.marks.isaac = { heart: 'normal' };
    expect(computeStatuses(data, p, REP).get(id('Lost Baby'))).not.toBe('unlocked');
    p.marks.isaac = { heart: 'hard' };
    expect(computeStatuses(data, p, REP).get(id('Lost Baby'))).toBe('unlocked');
  });
  it('exige toutes les marques combinées des Tainted', () => {
    const p = fresh();
    p.marks['tainted-isaac'] = { isaac: 'normal', bluebaby: 'normal', satan: 'normal' };
    const ach = data.markUnlocks.find((m) => m.characterSlug === 'tainted-isaac' && m.marks.length === 4)!.achievementId;
    expect(computeStatuses(data, p, REP).get(ach)).not.toBe('unlocked');
    p.marks['tainted-isaac']!.lamb = 'normal';
    expect(computeStatuses(data, p, REP).get(ach)).toBe('unlocked');
  });
  it('débloque les paliers de dons et respecte un statut manuel « locked »', () => {
    const p = fresh();
    p.donations.donation = 120;
    let s = computeStatuses(data, p, REP);
    expect(s.get(id('Blue Map'))).toBe('unlocked');
    expect(s.get(id('Store Upgrade lv.2'))).toBe('unlocked');
    expect(s.get(id('Black Candle'))).not.toBe('unlocked');
    p.unlocks[id('Blue Map')] = 'locked';
    s = computeStatuses(data, p, REP);
    expect(s.get(id('Blue Map'))).toBe('available');
  });
  it('calcule disponible/verrouillé à partir des prérequis', () => {
    const p = fresh();
    expect(computeStatuses(data, p, REP).get(id('The Lost'))).toBe('locked');
    p.unlocks[id('Missing Poster')] = 'unlocked';
    expect(computeStatuses(data, p, REP).get(id('The Lost'))).toBe('available');
  });
  it('calcule les statistiques par version', () => {
    const p = fresh();
    p.marks.isaac = { heart: 'hard', lamb: 'normal' };
    const stats = computeStats(data, p, REP);
    expect(stats.global.total).toBe(637);
    expect(stats.marks.total).toBe(34 * 12);
    expect(stats.marks.done).toBe(2);
    expect(stats.byCharacter.find((c) => c.slug === 'isaac')!.marks.done).toBe(2);
  });
  it('indique le prochain palier de dons', () => {
    const r = nextMilestone(data.donationMilestones, 'greed', 499);
    expect(r.next?.coins).toBe(500);
    expect(r.remaining).toBe(1);
  });
});

describe('planificateur', () => {
  it('ne recommande que des objectifs disponibles, avec leurs raisons', () => {
    const recs = recommend({ ...data, synergyCounts: new Map() }, fresh(), REP, { limit: 10 });
    expect(recs.length).toBe(10);
    const statuses = computeStatuses(data, fresh(), REP);
    for (const r of recs) {
      expect(['available', 'in_progress']).toContain(statuses.get(r.achievementId));
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });
  it('signale les étapes aléatoires des parcours', () => {
    const p = fresh();
    p.unlocks[id('The Negative')] = 'unlocked';
    p.unlocks[id('Missing Poster')] = 'unlocked';
    const recs = recommend({ ...data, synergyCounts: new Map() }, p, REP, { limit: 50 });
    const lost = recs.find((r) => r.achievementId === id('The Lost'))!;
    expect(lost.warnings.join(' ')).toMatch(/hasard/);
  });
  it('suit la progression d\'un parcours', () => {
    const path_ = data.plannerPaths.find((p) => p.slug === 'the-lost')!;
    const p = fresh();
    p.unlocks[id('The Negative')] = 'unlocked';
    const pp = pathProgress(path_, computeStatuses(data, p, REP));
    expect(pp.currentStep).toBe(1);
    expect(pp.done).toBe(1);
  });
});

describe('simulateur de build', () => {
  it('extrait uniquement les modificateurs simples et inconditionnels', () => {
    expect(parseStatMods('+0.7 tears.', REP)).toEqual([{ stat: 'tears', op: 'add', value: 0.7 }]);
    expect(parseStatMods('+2 damage for the current room.', REP)).toEqual([]);
    expect(parseStatMods('* ⟨7⟩ +5.25 range\n* ⟨24⟩ +2.5 range', REP)).toEqual([{ stat: 'range', op: 'add', value: 2.5 }]);
  });
  it('détecte les transformations et ne renvoie que des synergies documentées', () => {
    const guppy = data.transformations.find((t) => t.slug === 'guppy')!;
    const refs = guppy.members.filter((m) => m.kind === 'item').slice(0, 3);
    const a = analyzeBuild(refs, data, REP);
    expect(a.transformations.find((t) => t.slug === 'guppy')!.complete).toBe(true);
    for (const s of [...a.synergies, ...a.interactions]) {
      expect(data.synergies).toContainEqual(s);
    }
  });
});
