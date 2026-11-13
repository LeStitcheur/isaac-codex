import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, CheckSquare, Lightbulb, Shuffle } from 'lucide-react';
import type { Achievement, Guide } from '@isaac-codex/shared';
import { api } from '@/lib/api';
import { useProgressModel } from '@/lib/queries';
import { Markup } from '@/components/Markup';
import { EntityChip, ErrorState, Loading, PageHeader, Section, StatusBadge, VersionBadge } from '@/components/common';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

const CATEGORY_FR: Record<string, string> = {
  debutant: 'Débutant', intermediaire: 'Intermédiaire', expert: 'Expert', personnages: 'Personnages', deblocages: 'Déblocages',
  objets: 'Objets', boss: 'Boss', chemins: 'Chemins alternatifs', machines: 'Machines', optimisation: 'Optimisation des runs', secrets: 'Secrets',
};
const LEVEL_FR: Record<string, string> = { debutant: 'Débutant', intermediaire: 'Intermédiaire', expert: 'Expert' };

export function GuidesPage() {
  const [cat, setCat] = useState('');
  const q = useQuery({ queryKey: ['guides'], queryFn: () => api<{ items: (Omit<Guide, 'steps'> & { stepCount: number })[] }>('/api/guides', { auth: false }) });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const cats = [...new Set(q.data.items.map((g) => g.category))];
  const list = q.data.items.filter((g) => !cat || g.category === cat);
  return (
    <div>
      <PageHeader icon={<BookOpen />} title="Guides et stratégies" subtitle="Guides rédigés en français à partir des pages du wiki, avec prérequis, étapes, risques et différences entre versions." />
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setCat('')} className={cn('rounded-full px-3 py-1 text-sm ring-1', !cat ? 'bg-surface-3 ring-parchment/50 text-parchment' : 'ring-parchment/15 text-muted')}>Tous</button>
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cn('rounded-full px-3 py-1 text-sm ring-1', cat === c ? 'bg-surface-3 ring-parchment/50 text-parchment' : 'ring-parchment/15 text-muted')}>
            {CATEGORY_FR[c] ?? c}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((g) => (
          <Link key={g.slug} to={`/guides/${g.slug}`} className="panel card-hover p-4" data-testid="guide-card">
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="blood">{CATEGORY_FR[g.category]}</Badge>
              <Badge variant="muted">{LEVEL_FR[g.level]}</Badge>
              <span className="ml-auto text-xs text-faint">{g.stepCount} étapes</span>
            </div>
            <h2 className="font-display text-lg text-parchment">{g.title}</h2>
            <Markup text={g.summary} inline className="mt-1 block text-sm text-muted" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function GuideDetailPage() {
  const { slug = '' } = useParams();
  const q = useQuery({
    queryKey: ['guide', slug],
    queryFn: () => api<{ guide: Guide; related: { kind: string; key: string; name: string; nameFr: string | null }[]; achievements: Achievement[] }>(`/api/guides/${slug}`, { auth: false }),
  });
  const { model } = useProgressModel();
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const g = q.data.guide;
  const lists: [string, string[], React.ReactNode][] = [
    ['Conseils', g.tips, <Lightbulb key="t" className="size-4 text-q4" />],
    ['Risques', g.risks, <AlertTriangle key="r" className="size-4 text-blood-bright" />],
    ['Alternatives', g.alternatives, <Shuffle key="a" className="size-4 text-q3" />],
  ];
  return (
    <article className="space-y-5">
      <Link to="/guides" className="text-sm text-muted hover:text-ink">← Tous les guides</Link>
      <PageHeader kicker={`${CATEGORY_FR[g.category]} · ${LEVEL_FR[g.level]}`} title={g.title} subtitle={<Markup text={g.summary} inline />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {g.prerequisites.length > 0 && (
            <Section title="Prérequis">
              <ul className="space-y-1">{g.prerequisites.map((p) => <li key={p}><Markup text={`* ${p}`} /></li>)}</ul>
            </Section>
          )}
          <Section title="Étapes">
            <ol className="space-y-4">
              {g.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-blood/20 font-display text-blood-bright ring-1 ring-blood/40">{i + 1}</span>
                  <div>
                    <h3 className="font-display text-parchment">{s.title}</h3>
                    <Markup text={s.body} />
                  </div>
                </li>
              ))}
            </ol>
          </Section>
          {lists.map(([title, items, icon]) =>
            items.length ? (
              <Section key={title} title={<span className="flex items-center gap-2">{icon}{title}</span>}>
                <ul className="space-y-1">{items.map((t) => <li key={t}><Markup text={`* ${t}`} /></li>)}</ul>
              </Section>
            ) : null,
          )}
          {g.versionNotes.length > 0 && (
            <Section title="Selon la version du jeu">
              <ul className="space-y-2">
                {g.versionNotes.map((v) => (
                  <li key={v.text} className="flex gap-2"><VersionBadge mask={v.mask} /><Markup text={v.text} inline /></li>
                ))}
              </ul>
            </Section>
          )}
        </div>
        <div className="space-y-4">
          {q.data.achievements.length > 0 && (
            <Section title={<span className="flex items-center gap-2"><CheckSquare className="size-4" /> Succès concernés</span>}>
              <ul className="space-y-1.5">
                {q.data.achievements.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link to={`/succes/${a.id}`} className="truncate hover:underline">{a.name}</Link>
                    <StatusBadge status={model?.statuses.get(a.id)} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {q.data.related.length > 0 && (
            <Section title="Fiches liées">
              <div className="flex flex-wrap gap-2">
                {q.data.related.map((r) => <EntityChip key={`${r.kind}:${r.key}`} kind={r.kind as 'item'} id={r.key} name={r.name} />)}
              </div>
            </Section>
          )}
          <Section title="Sources">
            <ul className="space-y-1 text-sm">
              {g.sources.map((s) => (
                <li key={s}><a href={s} target="_blank" rel="noreferrer noopener" className="break-all text-muted underline">{decodeURIComponent(s.split('/wiki/')[1] ?? s).replace(/_/g, ' ')}</a></li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-faint">Guide rédigé pour Isaac Codex à partir de ces pages (CC BY-SA 4.0).</p>
          </Section>
        </div>
      </div>
    </article>
  );
}
