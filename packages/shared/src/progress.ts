/**
 * Calcul de l'état des déblocages et des statistiques de progression.
 * Règles :
 *  - un statut manuel « unlocked » ou « locked » l'emporte toujours ;
 *  - sinon, un succès est « débloqué » s'il découle des marques cochées (tableau du wiki) ou des dons déclarés ;
 *  - sinon « en cours » si l'utilisateur l'a indiqué ;
 *  - sinon « disponible » si tous ses prérequis sont débloqués, « verrouillé » dans le cas contraire.
 */
import type { Achievement, Character, CompletionMark, DonationMilestone, MarkKey, MarkUnlock } from './game-schema.js';
import type { ProfileProgress } from './profile-schema.js';

export type EffectiveStatus = 'locked' | 'available' | 'in_progress' | 'unlocked';

export interface ProgressContext {
  achievements: Achievement[];
  markUnlocks: MarkUnlock[];
  donationMilestones: DonationMilestone[];
  characters: Character[];
  completionMarks: CompletionMark[];
}

export function markDone(progress: ProfileProgress, characterSlug: string, mark: MarkKey, hard: boolean): boolean {
  const d = progress.marks[characterSlug]?.[mark];
  return hard ? d === 'hard' : d === 'normal' || d === 'hard';
}

export function marksForVersion(ctx: ProgressContext, versionBit: number): CompletionMark[] {
  return ctx.completionMarks.filter((m) => m.mask & versionBit).sort((a, b) => a.order - b.order);
}

export function charactersForVersion(ctx: ProgressContext, versionBit: number): Character[] {
  return ctx.characters.filter((c) => c.mask & versionBit);
}

function allHard(ctx: ProgressContext, progress: ProfileProgress, slug: string, versionBit: number): boolean {
  return marksForVersion(ctx, versionBit).every((m) => markDone(progress, slug, m.key, true));
}

/** Succès déduits des marques et des dons (sans tenir compte des statuts manuels). */
export function derivedUnlocks(ctx: ProgressContext, progress: ProfileProgress, versionBit: number): Set<number> {
  const out = new Set<number>();
  if (progress.settings.autoUnlockFromMarks) {
    for (const mu of ctx.markUnlocks) {
      if (mu.marks.every((m) => markDone(progress, mu.characterSlug, m, mu.hard))) out.add(mu.achievementId);
    }
    const chars = charactersForVersion(ctx, versionBit);
    for (const a of ctx.achievements) {
      if (a.kind !== 'allMarks') continue;
      if (a.characterSlug) {
        if (allHard(ctx, progress, a.characterSlug, versionBit)) out.add(a.id);
      } else {
        const pool = /non-tainted/i.test(a.requirementText) ? chars.filter((c) => !c.tainted) : chars;
        if (pool.length && pool.every((c) => allHard(ctx, progress, c.slug, versionBit))) out.add(a.id);
      }
    }
  }
  for (const m of ctx.donationMilestones) {
    const coins = m.machine === 'donation' ? progress.donations.donation : progress.donations.greed;
    if (coins >= m.coins) out.add(m.achievementId);
  }
  return out;
}

export function computeStatuses(ctx: ProgressContext, progress: ProfileProgress, versionBit: number): Map<number, EffectiveStatus> {
  const derived = derivedUnlocks(ctx, progress, versionBit);
  const unlocked = new Set<number>();
  for (const a of ctx.achievements) {
    const manual = progress.unlocks[a.id];
    if (manual === 'unlocked' || (manual !== 'locked' && derived.has(a.id))) unlocked.add(a.id);
  }
  const statuses = new Map<number, EffectiveStatus>();
  for (const a of ctx.achievements) {
    if (unlocked.has(a.id)) statuses.set(a.id, 'unlocked');
    else if (progress.unlocks[a.id] === 'in_progress') statuses.set(a.id, 'in_progress');
    else statuses.set(a.id, a.prerequisites.every((p) => unlocked.has(p)) ? 'available' : 'locked');
  }
  return statuses;
}

export interface Ratio {
  done: number;
  total: number;
  pct: number;
}
const ratio = (done: number, total: number): Ratio => ({ done, total, pct: total ? Math.round((done / total) * 1000) / 10 : 0 });

export interface ProgressStats {
  global: Ratio;
  marks: Ratio;
  byCharacter: { slug: string; name: string; tainted: boolean; marks: Ratio; unlocks: Ratio }[];
  byRewardKind: { kind: Achievement['reward']['kind']; ratio: Ratio }[];
  byKind: { kind: Achievement['kind']; ratio: Ratio }[];
  byVersion: { bit: number; ratio: Ratio }[];
  remaining: number;
}

export function computeStats(ctx: ProgressContext, progress: ProfileProgress, versionBit: number): ProgressStats {
  const statuses = computeStatuses(ctx, progress, versionBit);
  const inVersion = ctx.achievements.filter((a) => a.mask & versionBit);
  const isDone = (a: Achievement) => statuses.get(a.id) === 'unlocked';
  const count = (list: Achievement[]) => ratio(list.filter(isDone).length, list.length);
  const chars = charactersForVersion(ctx, versionBit).sort((a, b) => a.order - b.order);
  const marks = marksForVersion(ctx, versionBit);

  let marksDone = 0;
  for (const c of chars) for (const m of marks) if (markDone(progress, c.slug, m.key, false)) marksDone++;

  const rewardKinds = [...new Set(inVersion.map((a) => a.reward.kind))];
  const kinds = [...new Set(inVersion.map((a) => a.kind))];
  // Par version : succès apparus au plus tard dans cette version (masque contenant ce bit).
  const byVersion = [1, 2, 4, 8, 16].map((bit) => ({ bit, ratio: count(ctx.achievements.filter((a) => a.mask & bit)) }));

  return {
    global: count(inVersion),
    marks: ratio(marksDone, chars.length * marks.length),
    byCharacter: chars.map((c) => {
      const charAch = inVersion.filter((a) => a.characterSlug === c.slug);
      return {
        slug: c.slug,
        name: c.nameFr ?? c.nameEn,
        tainted: c.tainted,
        marks: ratio(marks.filter((m) => markDone(progress, c.slug, m.key, false)).length, marks.length),
        unlocks: count(charAch),
      };
    }),
    byRewardKind: rewardKinds.map((kind) => ({ kind, ratio: count(inVersion.filter((a) => a.reward.kind === kind)) })),
    byKind: kinds.map((kind) => ({ kind, ratio: count(inVersion.filter((a) => a.kind === kind)) })),
    byVersion,
    remaining: inVersion.filter((a) => !isDone(a)).length,
  };
}

/** Prochain palier de dons. */
export function nextMilestone(milestones: DonationMilestone[], machine: 'donation' | 'greed', coins: number) {
  const list = milestones.filter((m) => m.machine === machine).sort((a, b) => a.coins - b.coins);
  const reached = list.filter((m) => m.coins <= coins);
  const next = list.find((m) => m.coins > coins) ?? null;
  const max = list.length ? list[list.length - 1]!.coins : 0;
  return { reached, next, remaining: next ? next.coins - coins : 0, max, pct: max ? Math.min(100, Math.round((coins / max) * 1000) / 10) : 0 };
}
