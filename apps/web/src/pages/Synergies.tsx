import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { GitCompareArrows, Sparkles, X } from 'lucide-react';
import type { Synergy, Transformation } from '@isaac-codex/shared';
import { api, qs } from '@/lib/api';
import { Markup } from '@/components/Markup';
import { Sprite } from '@/components/Sprite';
import { EmptyState, EntityChip, Loading, PageHeader, Section, VersionBadge } from '@/components/common';
import { Badge, Button, Input } from '@/components/ui';
import { useSearch } from '@/components/SearchCommand';
import { cn } from '@/lib/utils';
import { asset, GameIcon } from '@/lib/game-assets';

export interface PickedRef {
  kind: 'item' | 'trinket';
  key: string;
  name: string;
}

/** Sélecteur d'objet/trinket avec recherche floue. */
export function EntityPicker({ onPick, placeholder = 'Rechercher un objet ou un trinket…', testId }: { onPick: (r: PickedRef) => void; placeholder?: string; testId?: string }) {
  const [q, setQ] = useState('');
  const { data } = useSearch(q, ['item', 'trinket'], 8);
  return (
    <div className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} data-testid={testId} />
      {q.trim() && data && data.length > 0 && (
        <ul className="panel absolute z-20 mt-1 max-h-72 w-full overflow-y-auto p-1">
          {data.map((r) => (
            <li key={`${r.kind}:${r.key}`}>
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-2"
                onClick={() => {
                  onPick({ kind: r.kind as 'item' | 'trinket', key: r.key, name: r.title });
                  setQ('');
                }}
                data-testid="picker-option"
              >
                <Sprite kind={r.kind as 'item'} id={r.key} size={24} />
                <span className="truncate">{r.title}</span>
                <span className="ml-auto text-xs text-faint">{r.subtitle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SynView = Synergy & { other: { kind: string; key: string; name: string; nameFr: string | null } };

function ItemSynergies({ picked }: { picked: PickedRef }) {
  const path = picked.kind === 'item' ? `/api/items/${picked.key}` : `/api/trinkets/${picked.key}`;
  const q = useQuery({ queryKey: ['syn-detail', path], queryFn: () => api<{ synergies: SynView[] }>(path, { auth: false }) });
  if (q.isLoading) return <Loading />;
  const list = q.data?.synergies ?? [];
  const groups = [
    { title: 'Synergies connues', items: list.filter((s) => s.section === 'synergy') },
    { title: 'Interactions possiblement négatives', items: list.filter((s) => s.section === 'interaction' && s.possiblyNegative) },
    { title: 'Autres interactions', items: list.filter((s) => s.section === 'interaction' && !s.possiblyNegative) },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {groups.map((g) => (
        <Section key={g.title} title={`${g.title} (${g.items.length})`}>
          {g.items.length === 0 ? (
            <p className="text-sm text-muted">Rien de documenté.</p>
          ) : (
            <ul className="space-y-2">
              {g.items.map((s, i) => (
                <li key={i} className="rounded-md bg-abyss/40 p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <EntityChip kind={s.other.kind as 'item'} id={s.other.key} name={s.other.name} />
                    {s.mask !== null && <VersionBadge mask={s.mask} />}
                  </div>
                  <Markup text={s.text} className="text-sm" />
                </li>
              ))}
            </ul>
          )}
        </Section>
      ))}
    </div>
  );
}

function Compare() {
  const [a, setA] = useState<PickedRef | null>(null);
  const [b, setB] = useState<PickedRef | null>(null);
  const q = useQuery({
    queryKey: ['compare', a?.kind, a?.key, b?.kind, b?.key],
    enabled: !!a && !!b,
    queryFn: () =>
      api<{ documented: Synergy[]; sharedTransformations: { slug: string; nameEn: string; nameFr: string | null }[]; note: string | null; a: { entity: { description: string } }; b: { entity: { description: string } } }>(
        `/api/synergies/compare${qs({ a: `${a!.kind}:${a!.key}`, b: `${b!.kind}:${b!.key}` })}`,
        { auth: false },
      ),
  });
  const slot = (p: PickedRef | null, set: (p: PickedRef | null) => void, label: string) =>
    p ? (
      <div className="flex items-center gap-2">
        <EntityChip kind={p.kind} id={p.key} name={p.name} />
        <Button variant="ghost" size="icon" onClick={() => set(null)} aria-label="Retirer"><X /></Button>
      </div>
    ) : (
      <EntityPicker onPick={set} placeholder={label} />
    );
  return (
    <Section title={<span className="flex items-center gap-2"><GitCompareArrows className="size-5" /> Comparer deux objets</span>}>
      <div className="grid gap-3 md:grid-cols-2">
        {slot(a, setA, 'Premier objet…')}
        {slot(b, setB, 'Second objet…')}
      </div>
      {q.data && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Markup text={q.data.a.entity.description} className="rounded-md bg-abyss/40 p-3 text-sm" />
            <Markup text={q.data.b.entity.description} className="rounded-md bg-abyss/40 p-3 text-sm" />
          </div>
          {q.data.documented.map((s, i) => (
            <div key={i} className="rounded-md border border-parchment/15 p-3">
              <Badge variant={s.section === 'synergy' ? 'ok' : s.possiblyNegative ? 'warn' : 'muted'}>
                {s.section === 'synergy' ? 'Synergie documentée' : s.possiblyNegative ? 'Interaction possiblement négative' : 'Interaction documentée'}
              </Badge>
              <Markup text={s.text} className="mt-2 text-sm" />
            </div>
          ))}
          {q.data.sharedTransformations.length > 0 && (
            <p className="text-sm">Transformation commune : {q.data.sharedTransformations.map((t) => t.nameEn).join(', ')}</p>
          )}
          {q.data.note && <p className="text-sm text-muted">{q.data.note}</p>}
        </div>
      )}
    </Section>
  );
}

function Transformations({ highlight }: { highlight: string | null }) {
  const q = useQuery({
    queryKey: ['transformations'],
    queryFn: () => api<{ items: (Transformation & { membersLabels: { kind: string; key: string; name: string; nameFr: string | null }[] })[] }>('/api/transformations', { auth: false }),
  });
  if (q.isLoading) return <Loading />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {q.data?.items.map((t) => (
        <div key={t.slug} id={`tr-${t.slug}`} className={cn('panel p-4', highlight === t.slug && 'ring-2 ring-blood')}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-xl text-parchment">
              <GameIcon src={asset('transformations', t.slug)} size={28} />
              {t.nameEn}
            </h3>
            <VersionBadge mask={t.mask} />
          </div>
          <Markup text={t.description} className="text-sm" />
          <p className="mt-2 text-xs text-muted">Condition : <Markup text={t.requirement} inline /></p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {t.membersLabels.map((m) => (
              <EntityChip key={`${m.kind}:${m.key}`} kind={m.kind as 'item'} id={m.key} name={m.name} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SynergiesPage() {
  const [params, setParams] = useSearchParams();
  const [picked, setPicked] = useState<PickedRef | null>(null);
  const transformation = params.get('transformation');
  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Sparkles />}
        title="Synergies"
        subtitle="Interactions entre objets documentées par le wiki communautaire. Rien n'est inventé : l'absence d'entrée signifie seulement qu'aucune interaction n'est documentée."
        actions={
          <Button asChild variant="parchment">
            <Link to="/simulateur">Simulateur de build →</Link>
          </Button>
        }
      />
      <Section title="Rechercher les synergies d'un objet">
        <EntityPicker onPick={setPicked} testId="synergy-picker" />
        {picked && (
          <div className="mt-4">
            <div className="mb-3 flex items-center gap-2">
              <EntityChip kind={picked.kind} id={picked.key} name={picked.name} />
              <Button variant="ghost" size="sm" onClick={() => setPicked(null)}><X /> Effacer</Button>
            </div>
            <ItemSynergies picked={picked} />
          </div>
        )}
        {!picked && <EmptyState>Choisissez un objet pour voir ses synergies et interactions documentées.</EmptyState>}
      </Section>
      <Compare />
      <Section
        title="Transformations"
        actions={transformation ? <Button variant="ghost" size="sm" onClick={() => setParams({})}>Tout afficher</Button> : undefined}
      >
        <Transformations highlight={transformation} />
      </Section>
    </div>
  );
}
