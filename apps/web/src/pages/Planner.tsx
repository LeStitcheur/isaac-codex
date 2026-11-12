import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, Circle, CircleDot, Target } from 'lucide-react';
import { pathProgress } from '@isaac-codex/shared';
import { useMeta, usePatchProgress, useProgressModel } from '@/lib/queries';
import { Markup } from '@/components/Markup';
import { ErrorState, Loading, PageHeader, Section, StatusBadge } from '@/components/common';
import { Badge, Label, Progress, Select } from '@/components/ui';
import { cn, displayName } from '@/lib/utils';
import { useRecommendations } from './Home';

export function PlannerPage() {
  const { model, progress, isLoading, error } = useProgressModel();
  const meta = useMeta();
  const recos = useRecommendations(15);
  const patch = usePatchProgress();
  if (isLoading) return <Loading />;
  if (error || !model || !progress || !meta.data) return <ErrorState error={error} />;
  const prefs = progress.settings.preferences;
  const setPrefs = (p: Partial<typeof prefs>) => patch.mutate({ settings: { preferences: { ...prefs, ...p } } });
  const achievementName = (id: number) => model.ctx.achievements.find((a) => a.id === id)?.name ?? `#${id}`;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Target />}
        title="Que débloquer ensuite ?"
        subtitle="Recommandations calculées à partir de votre progression déclarée : prérequis remplis, difficulté estimée, utilité de la récompense, objectifs ouverts et parcours en cours."
      />
      <Section title="Mes préférences">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-focus">Priorité</Label>
            <Select id="p-focus" value={prefs.focus} onChange={(e) => setPrefs({ focus: e.target.value as typeof prefs.focus })}>
              <option value="balanced">Équilibrée</option>
              <option value="characters">Personnages d'abord</option>
              <option value="items">Objets d'abord</option>
              <option value="completion">Marques de complétion</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={prefs.avoidHard} onChange={(e) => setPrefs({ avoidHard: e.target.checked })} className="accent-[var(--color-blood)]" />
            Éviter le mode difficile
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="p-fav">Ajouter un personnage favori</Label>
            <Select
              id="p-fav"
              value=""
              onChange={(e) => e.target.value && setPrefs({ favoriteCharacters: [...new Set([...prefs.favoriteCharacters, e.target.value])] })}
            >
              <option value="">Choisir…</option>
              {meta.data.characters.map((c) => <option key={c.slug} value={c.slug}>{displayName(c)}</option>)}
            </Select>
            <div className="flex flex-wrap gap-1">
              {prefs.favoriteCharacters.map((slug) => (
                <button key={slug} onClick={() => setPrefs({ favoriteCharacters: prefs.favoriteCharacters.filter((s) => s !== slug) })}>
                  <Badge variant="parchment">{displayName(meta.data.characters.find((c) => c.slug === slug))} ✕</Badge>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Recommandations" actions={<span className="text-xs text-faint">Aucun résultat soumis au hasard n'est garanti.</span>}>
        {recos.isLoading && <Loading />}
        <ol className="space-y-2" data-testid="recommendations">
          {recos.data?.recommendations.map((r, i) => (
            <li key={r.achievementId} className="rounded-lg border border-parchment/10 bg-abyss/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg text-blood-bright">{i + 1}.</span>
                <Link to={`/succes/${r.achievementId}`} className="font-medium text-parchment hover:underline">{r.achievement.name}</Link>
                <StatusBadge status={r.status} />
                <span className="ml-auto text-xs text-faint">score {r.score}</span>
              </div>
              <Markup text={r.achievement.requirement} className="mt-1 text-sm" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.reasons.map((reason) => <Badge key={reason} variant="muted">{reason}</Badge>)}
                {r.warnings.map((w) => <Badge key={w} variant="warn"><AlertTriangle className="size-3" /> {w}</Badge>)}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Parcours prédéfinis">
        <div className="grid gap-4 lg:grid-cols-2">
          {meta.data.plannerPaths.map((path) => {
            const pp = pathProgress(path, model.statuses);
            return (
              <div key={path.slug} className="rounded-lg border border-parchment/10 bg-abyss/40 p-4" data-testid="planner-path">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="font-display text-lg text-parchment">{path.title}</h3>
                  {pp.completed ? <Badge variant="ok">Terminé</Badge> : <span className="text-xs text-muted">{pp.done}/{pp.total} étapes</span>}
                </div>
                <Markup text={path.summary} className="text-sm text-muted" />
                <Progress value={pp.completed ? 100 : pp.pct} className="my-3" tone={pp.completed ? 'ok' : 'blood'} />
                <ol className="space-y-2">
                  {path.steps.map((step, i) => {
                    const st = pp.steps[i]!;
                    return (
                      <li key={i} className={cn('flex gap-2 text-sm', st.status === 'todo' && 'opacity-70')}>
                        {st.status === 'done' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : st.status === 'current' ? <CircleDot className="mt-0.5 size-4 shrink-0 text-blood-bright" /> : <Circle className="mt-0.5 size-4 shrink-0 text-faint" />}
                        <div>
                          <div className={cn(st.status === 'current' && 'text-parchment')}>
                            {step.title}
                            {step.random && <Badge variant="warn" className="ml-2">aléatoire</Badge>}
                          </div>
                          <Markup text={step.body} className="text-muted" />
                          {step.achievementIds.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {step.achievementIds.slice(0, 8).map((id) => (
                                <Link key={id} to={`/succes/${id}`}>
                                  <Badge variant={model.statuses.get(id) === 'unlocked' ? 'ok' : 'muted'}>{achievementName(id)}</Badge>
                                </Link>
                              ))}
                              {step.achievementIds.length > 8 && <Badge variant="muted">+{step.achievementIds.length - 8}</Badge>}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {path.guideSlug && <Link to={`/guides/${path.guideSlug}`} className="mt-3 inline-block text-sm text-parchment hover:underline">Lire le guide complet →</Link>}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
