/**
 * Planificateur « Que débloquer ensuite ? ».
 * Le score combine des critères explicites (prérequis, difficulté estimée, utilité de la récompense,
 * objectifs ouverts, parcours en cours, préférences). Chaque recommandation expose ses raisons.
 * Aucun résultat n'est garanti : les objectifs aléatoires sont signalés comme tels.
 */
import type { Achievement, Item, PlannerPath } from './game-schema.js';
import { computeStatuses, type EffectiveStatus, type ProgressContext } from './progress.js';
import type { ProfileProgress } from './profile-schema.js';

export interface RecommendContext extends ProgressContext {
  items: Pick<Item, 'id' | 'quality' | 'nameEn' | 'nameFr'>[];
  plannerPaths: PlannerPath[];
  synergyCounts?: Map<string, number>;
}

export interface Recommendation {
  achievementId: number;
  score: number;
  status: EffectiveStatus;
  reasons: string[];
  warnings: string[];
  pathSlugs: string[];
}

export interface PathProgress {
  slug: string;
  done: number;
  total: number;
  pct: number;
  completed: boolean;
  currentStep: number | null;
  steps: { index: number; status: 'done' | 'current' | 'todo'; achievementStatuses: { id: number; status: EffectiveStatus }[] }[];
}

export function pathProgress(path: PlannerPath, statuses: Map<number, EffectiveStatus>): PathProgress {
  let current: number | null = null;
  const steps = path.steps.map((s, index) => {
    const achievementStatuses = s.achievementIds.map((id) => ({ id, status: statuses.get(id) ?? 'locked' }));
    const done = s.achievementIds.length > 0 && achievementStatuses.every((a) => a.status === 'unlocked');
    let status: 'done' | 'current' | 'todo' = done ? 'done' : 'todo';
    if (!done && current === null) {
      current = index;
      status = 'current';
    }
    return { index, status, achievementStatuses };
  });
  const goals = path.goalAchievementIds;
  const goalDone = goals.filter((id) => statuses.get(id) === 'unlocked').length;
  const completed = goals.length > 0 && goalDone === goals.length;
  const doneSteps = steps.filter((s) => s.status === 'done').length;
  return {
    slug: path.slug,
    done: doneSteps,
    total: steps.length,
    pct: steps.length ? Math.round((doneSteps / steps.length) * 100) : 0,
    completed,
    currentStep: completed ? null : current,
    steps,
  };
}

const REWARD_LABEL: Record<Achievement['reward']['kind'], string> = {
  character: 'débloque un personnage',
  item: 'débloque un objet',
  trinket: 'débloque un trinket',
  consumable: 'débloque un consommable',
  floor: 'ouvre un nouvel étage',
  challenge: 'débloque un défi',
  baby: 'débloque un bébé coopératif',
  other: 'débloque un contenu',
};

export function recommend(
  ctx: RecommendContext,
  progress: ProfileProgress,
  versionBit: number,
  opts: { limit?: number; characterSlug?: string | null } = {},
): Recommendation[] {
  const statuses = computeStatuses(ctx, progress, versionBit);
  const prefs = progress.settings.preferences;
  const itemsById = new Map(ctx.items.map((i) => [String(i.id), i]));
  const marksDoneByChar = new Map<string, number>();
  for (const [slug, marks] of Object.entries(progress.marks)) marksDoneByChar.set(slug, Object.keys(marks).length);

  // Nombre d'objectifs non débloqués qui dépendent de chaque succès.
  const dependents = new Map<number, number>();
  for (const a of ctx.achievements) {
    if (statuses.get(a.id) === 'unlocked' || !(a.mask & versionBit)) continue;
    for (const p of a.prerequisites) dependents.set(p, (dependents.get(p) ?? 0) + 1);
  }

  // Étapes « en cours » des parcours.
  const currentPathSteps = new Map<number, { slug: string; title: string; random: boolean }[]>();
  for (const path of ctx.plannerPaths) {
    const pp = pathProgress(path, statuses);
    if (pp.currentStep === null) continue;
    const step = path.steps[pp.currentStep]!;
    for (const id of step.achievementIds) {
      if (!currentPathSteps.has(id)) currentPathSteps.set(id, []);
      currentPathSteps.get(id)!.push({ slug: path.slug, title: path.title, random: step.random });
    }
  }

  const out: Recommendation[] = [];
  for (const a of ctx.achievements) {
    if (!(a.mask & versionBit)) continue;
    const status = statuses.get(a.id)!;
    if (status !== 'available' && status !== 'in_progress') continue;
    if (opts.characterSlug && a.characterSlug !== opts.characterSlug) continue;

    const reasons: string[] = [];
    const warnings: string[] = [];
    let score = 0;

    if (status === 'in_progress') {
      score += 15;
      reasons.push('Vous l\'avez marqué « en cours »');
    }
    if (a.prerequisites.length) reasons.push('Tous les prérequis sont remplis');

    score += (6 - a.difficulty) * 8;
    reasons.push(`Difficulté estimée ${a.difficulty}/5`);

    const hard = /hard mode/i.test(a.requirementText);
    if (hard && prefs.avoidHard) {
      score -= 15;
      warnings.push('Nécessite le mode difficile');
    }

    // Utilité de la récompense
    switch (a.reward.kind) {
      case 'character':
        score += 30;
        break;
      case 'item': {
        const it = a.reward.key ? itemsById.get(a.reward.key) : undefined;
        const q = it?.quality ?? 1;
        score += 4 + q * 6;
        if (q >= 3) reasons.push(`Récompense de qualité ${q}`);
        const syn = a.reward.key ? ctx.synergyCounts?.get(`item:${a.reward.key}`) ?? 0 : 0;
        if (syn >= 10) {
          score += Math.min(8, Math.floor(syn / 10));
          reasons.push(`${syn} synergies documentées pour la récompense`);
        }
        break;
      }
      case 'floor':
        score += 18;
        break;
      case 'trinket':
        score += 8;
        break;
      case 'consumable':
        score += 6;
        break;
      case 'challenge':
        score += 5;
        break;
      case 'baby':
        score += 2;
        break;
      default:
        score += 6;
    }
    reasons.push(REWARD_LABEL[a.reward.kind]);

    const deps = dependents.get(a.id) ?? 0;
    if (deps > 0) {
      score += Math.min(20, deps * 4);
      reasons.push(`Ouvre la voie à ${deps} autre${deps > 1 ? 's' : ''} objectif${deps > 1 ? 's' : ''}`);
    }

    const pathSteps = currentPathSteps.get(a.id) ?? [];
    if (pathSteps.length) {
      score += 12;
      reasons.push(`Étape actuelle du parcours « ${pathSteps[0]!.title} »`);
      if (pathSteps.some((p) => p.random)) warnings.push('Dépend du hasard : aucun résultat garanti');
    }

    if (a.characterSlug) {
      if (prefs.favoriteCharacters.includes(a.characterSlug)) {
        score += 12;
        reasons.push('Personnage favori');
      } else if ((marksDoneByChar.get(a.characterSlug) ?? 0) > 0) {
        score += 6;
        reasons.push('Personnage déjà en cours de progression');
      }
    }
    if (a.kind === 'donation' || a.kind === 'greedDonation') reasons.push('Progression cumulative (dons conservés entre les parties)');

    if (prefs.focus === 'characters' && a.reward.kind === 'character') score += 15;
    if (prefs.focus === 'items' && (a.reward.kind === 'item' || a.reward.kind === 'trinket')) score += 10;
    if (prefs.focus === 'completion' && a.kind === 'mark') score += 10;

    out.push({ achievementId: a.id, score: Math.round(score), status, reasons, warnings, pathSlugs: pathSteps.map((p) => p.slug) });
  }
  out.sort((x, y) => y.score - x.score || x.achievementId - y.achievementId);
  return out.slice(0, opts.limit ?? 20);
}
