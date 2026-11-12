import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Map as MapIcon } from 'lucide-react';
import type { Achievement, Boss, Floor, Route } from '@isaac-codex/shared';
import { api } from '@/lib/api';
import { useMeta, useProgressModel } from '@/lib/queries';
import { Markup } from '@/components/Markup';
import { Sprite } from '@/components/Sprite';
import { ErrorState, Loading, PageHeader, Section, SourceNote, StatusBadge, VersionBadge } from '@/components/common';
import { MarkIcon } from '@/lib/game-assets';
import { Badge } from '@/components/ui';
import { displayName } from '@/lib/utils';

function RouteDiagram({ route, floors }: { route: Route; floors: Floor[] }) {
  const { model } = useProgressModel();
  const meta = useMeta();
  return (
    <div className="panel overflow-hidden" data-testid="route">
      <div className="h-1.5" style={{ background: route.color }} />
      <div className="p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg text-parchment">{route.title}</h3>
          <Badge variant="blood">Boss final : {route.finalBoss}</Badge>
        </div>
        <Markup text={route.summary} className="text-sm text-muted" />
        <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-stretch">
          {route.stages.map((st, i) => (
            <div key={i} className="flex items-stretch gap-2 lg:flex-1">
              <div className="flex-1 rounded-md bg-abyss/50 p-2.5 ring-1 ring-parchment/10">
                <div className="mb-1.5 text-[11px] uppercase tracking-wider" style={{ color: route.color }}>{st.label}</div>
                <div className="flex flex-wrap gap-1">
                  {st.floors.map((f) => {
                    const fl = floors.find((x) => x.slug === f);
                    return (
                      <Link key={f} to={`/etages/${f}`}>
                        <Badge variant={fl?.alternate ? 'parchment' : 'default'}>{fl ? displayName(fl) : f}</Badge>
                      </Link>
                    );
                  })}
                </div>
                {st.note && <Markup text={st.note} className="mt-1.5 text-xs text-muted" />}
              </div>
              {i < route.stages.length - 1 && <ChevronRight className="hidden size-5 self-center text-faint lg:block" />}
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 text-sm">
          {route.requirements.map((r) => <Markup key={r} text={`* ${r}`} />)}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {route.achievementIds.map((id) => {
            const a = model?.ctx.achievements.find((x) => x.id === id);
            return (
              <Link key={id} to={`/succes/${id}`} className="inline-flex items-center gap-1.5">
                <span className="text-xs text-muted">{a?.name ?? `#${id}`}</span>
                <StatusBadge status={model?.statuses.get(id)} />
              </Link>
            );
          })}
          {route.marks.map((m) => (
            <Badge key={m} variant="muted"><MarkIcon markKey={m} state="hard" size={10} className="-my-1 -ml-1" />Marque : {meta.data?.completionMarks.find((x) => x.key === m)?.nameFr ?? m}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FloorsPage() {
  const q = useQuery({ queryKey: ['floors'], queryFn: () => api<{ items: Floor[]; routes: Route[] }>('/api/floors', { auth: false }) });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const chapters = [...new Set(q.data.items.map((f) => f.chapter))].sort((a, b) => a - b);
  return (
    <div className="space-y-6">
      <PageHeader icon={<MapIcon />} title="Étages et routes" subtitle="Les chemins principaux vers chaque fin, avec leurs conditions d'accès, puis la liste de tous les étages et de leurs boss." />
      <div className="space-y-4">
        {q.data.routes.map((r) => <RouteDiagram key={r.slug} route={r} floors={q.data.items} />)}
      </div>
      <Section title="Tous les étages">
        <div className="space-y-4">
          {chapters.map((ch) => (
            <div key={ch}>
              <div className="mb-2 eyebrow">Chapitre {ch}</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {q.data.items.filter((f) => f.chapter === ch).map((f) => (
                  <Link key={f.slug} to={`/etages/${f.slug}`} className="panel card-hover flex items-center gap-3 p-3">
                    <Sprite kind="floor" id={f.slug} size={36} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><span className="truncate">{displayName(f)}</span><VersionBadge mask={f.mask} /></div>
                      <div className="text-xs text-muted">{f.alternate ? 'Chemin alternatif' : 'Chemin principal'} · {f.bosses.length} boss</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

export function FloorDetailPage() {
  const { slug = '' } = useParams();
  const q = useQuery({
    queryKey: ['floor', slug],
    queryFn: () => api<{ floor: Floor; bosses: Pick<Boss, 'slug' | 'nameEn' | 'nameFr'>[]; unlockAchievement: Achievement | null; routes: Route[] }>(`/api/floors/${slug}`, { auth: false }),
  });
  const floors = useQuery({ queryKey: ['floors'], queryFn: () => api<{ items: Floor[]; routes: Route[] }>('/api/floors', { auth: false }) });
  const { model } = useProgressModel();
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const f = q.data.floor;
  return (
    <div className="space-y-5">
      <Link to="/etages" className="text-sm text-muted hover:text-ink">← Étages et routes</Link>
      <PageHeader kicker={`Chapitre ${f.chapter} · ${f.alternate ? 'chemin alternatif' : 'chemin principal'}`} title={displayName(f)} actions={<VersionBadge mask={f.mask} />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Accès">
          {q.data.unlockAchievement ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={model?.statuses.get(q.data.unlockAchievement.id)} />
                <Link to={`/succes/${q.data.unlockAchievement.id}`} className="text-parchment hover:underline">{q.data.unlockAchievement.name}</Link>
              </div>
              <Markup text={q.data.unlockAchievement.requirement} />
            </div>
          ) : (
            <p className="text-muted">Aucun déblocage requis.</p>
          )}
        </Section>
        <Section title={`Boss possibles (${q.data.bosses.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {q.data.bosses.map((b) => <Link key={b.slug} to={`/boss/${b.slug}`}><Badge variant="parchment">{displayName(b)}</Badge></Link>)}
          </div>
        </Section>
      </div>
      {q.data.routes.length > 0 && floors.data && (
        <Section title="Routes passant par cet étage">
          <div className="space-y-3">{q.data.routes.map((r) => <RouteDiagram key={r.slug} route={r} floors={floors.data.items} />)}</div>
        </Section>
      )}
      <SourceNote source={f.source} />
    </div>
  );
}
