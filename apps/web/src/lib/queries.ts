import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  computeStats, computeStatuses, versionBit,
  type Achievement, type Character, type CompletionMark, type DatasetMeta, type DonationMilestone, type MarkUnlock,
  type PlannerPath, type Pool, type ProfileProgress, type ProgressPatch, type VersionKey, VERSIONS,
} from '@isaac-codex/shared';
import { api, ApiError } from './api';
import { useActiveProfile, useProfileStore } from './profile-store';

export type CharacterSummary = Pick<Character, 'slug' | 'nameEn' | 'nameFr' | 'tainted' | 'baseSlug' | 'order' | 'health' | 'unlockAchievementId' | 'mask' | 'startingItems'> & {
  difficulty: number | null;
};

export interface MetaResponse {
  meta: DatasetMeta;
  versions: typeof VERSIONS;
  completionMarks: CompletionMark[];
  pools: Pool[];
  transformations: { slug: string; nameEn: string; nameFr: string | null; mask: number }[];
  tags: string[];
  characters: CharacterSummary[];
  markUnlocks: MarkUnlock[];
  donationMilestones: DonationMilestone[];
  plannerPaths: PlannerPath[];
  floors: { slug: string; nameEn: string; nameFr: string | null; chapter: number; alternate: boolean; mask: number }[];
  disclaimer: string;
}

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: () => api<MetaResponse>('/api/meta', { auth: false }), staleTime: Infinity });
}

export function useAchievements() {
  return useQuery({
    queryKey: ['achievements'],
    queryFn: () => api<{ items: Achievement[] }>('/api/unlocks?pageSize=1000', { auth: false }).then((r) => r.items),
    staleTime: Infinity,
  });
}

export interface ItemIndexEntry {
  id: number;
  nameEn: string;
  nameFr: string | null;
  quality?: number | null;
  kind?: string;
  familiar?: boolean;
  mask: number;
  unlockAchievementId: number | null;
}
export function useItemIndex() {
  return useQuery({
    queryKey: ['item-index'],
    queryFn: () => api<{ items: ItemIndexEntry[]; trinkets: ItemIndexEntry[] }>('/api/items/index', { auth: false }),
    staleTime: Infinity,
  });
}

export function useSpriteManifest() {
  return useQuery({
    queryKey: ['sprites'],
    queryFn: () => api<Record<string, string[]>>('/api/sprites/manifest', { auth: false }).then((m) => {
      const sets: Record<string, Set<string>> = {};
      for (const [k, files] of Object.entries(m)) sets[k] = new Set(files);
      return sets;
    }),
    staleTime: 5 * 60_000,
  });
}

/** Progression du profil actif. Un jeton invalide (profil supprimé côté serveur) retire le profil local. */
export function useProgress() {
  const profile = useActiveProfile();
  const remove = useProfileStore((s) => s.remove);
  return useQuery({
    queryKey: ['progress', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      try {
        return await api<ProfileProgress>(`/api/profiles/${profile!.id}/progress`);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) remove(profile!.id);
        throw e;
      }
    },
    staleTime: 30_000,
  });
}

/** Application locale d'un patch (mise à jour optimiste, identique à la logique serveur). */
export function applyPatchLocal(p: ProfileProgress, patch: ProgressPatch): ProfileProgress {
  const next: ProfileProgress = {
    ...p,
    unlocks: { ...p.unlocks },
    marks: Object.fromEntries(Object.entries(p.marks).map(([k, v]) => [k, { ...v }])),
    favorites: [...p.favorites],
    donations: { ...p.donations },
    items: { ...p.items },
    settings: { ...p.settings, ...(patch.settings ?? {}), preferences: { ...p.settings.preferences, ...(patch.settings?.preferences ?? {}) } },
  };
  for (const u of patch.unlocks ?? []) {
    if (u.status === null) delete next.unlocks[u.achievementId];
    else next.unlocks[u.achievementId] = u.status;
  }
  for (const m of patch.marks ?? []) {
    next.marks[m.characterSlug] ??= {};
    if (m.difficulty === null) delete next.marks[m.characterSlug]![m.markKey];
    else next.marks[m.characterSlug]![m.markKey] = m.difficulty;
  }
  for (const f of patch.favorites ?? []) {
    next.favorites = next.favorites.filter((x) => !(x.kind === f.kind && x.key === f.key));
    if (f.favorite) next.favorites.unshift({ kind: f.kind, key: f.key });
  }
  if (patch.donations) Object.assign(next.donations, Object.fromEntries(Object.entries(patch.donations).filter(([, v]) => v !== undefined)));
  for (const i of patch.items ?? []) {
    if (i.status === null) delete next.items[`${i.kind}:${i.key}`];
    else next.items[`${i.kind}:${i.key}`] = i.status;
  }
  return next;
}

export function usePatchProgress() {
  const profile = useActiveProfile();
  const qc = useQueryClient();
  const key = ['progress', profile?.id];
  return useMutation({
    mutationFn: (patch: ProgressPatch) => api<ProfileProgress>(`/api/profiles/${profile!.id}/progress`, { method: 'PATCH', body: patch }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ProfileProgress>(key);
      if (prev) qc.setQueryData(key, applyPatchLocal(prev, patch));
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (data) => qc.setQueryData(key, data),
    onSettled: (_d, _e, patch) => {
      if (!patch.history) void qc.invalidateQueries({ queryKey: ['recommendations'] });
    },
  });
}

/** Statuts et statistiques calculés en direct (mêmes règles que le serveur, code partagé). */
export function useProgressModel() {
  const meta = useMeta();
  const achievements = useAchievements();
  const progress = useProgress();
  const hasProfile = !!useActiveProfile();
  const model = useMemo(() => {
    if (!meta.data || !achievements.data || !progress.data) return null;
    const ctx = {
      achievements: achievements.data,
      markUnlocks: meta.data.markUnlocks,
      donationMilestones: meta.data.donationMilestones,
      characters: meta.data.characters as unknown as Character[],
      completionMarks: meta.data.completionMarks,
    };
    const bit = versionBit(progress.data.settings.gameVersion as VersionKey);
    return { ctx, bit, statuses: computeStatuses(ctx, progress.data, bit), stats: computeStats(ctx, progress.data, bit) };
  }, [meta.data, achievements.data, progress.data]);
  // Sans profil actif (création en cours au premier lancement), on reste en chargement plutôt que d'afficher une erreur.
  return {
    model,
    progress: progress.data ?? null,
    isLoading: meta.isPending || achievements.isPending || !hasProfile || progress.isPending,
    error: meta.error ?? achievements.error ?? progress.error,
  };
}

export function useVersionBit(): number {
  const { data } = useProgress();
  return versionBit((data?.settings.gameVersion ?? 'repentance') as VersionKey);
}

export function useRecordView() {
  const patch = usePatchProgress();
  const profile = useActiveProfile();
  return (kind: 'item' | 'trinket' | 'consumable' | 'character' | 'boss' | 'floor', key: string) => {
    if (profile) patch.mutate({ history: [{ kind, key }] });
  };
}
