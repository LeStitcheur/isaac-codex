import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Search, Skull } from 'lucide-react';
import type { Achievement, Boss, CompletionMark, Floor } from '@isaac-codex/shared';
import { api, qs } from '@/lib/api';
import { useProgressModel } from '@/lib/queries';
import { Markup } from '@/components/Markup';
import { Sprite } from '@/components/Sprite';
import { EmptyState, ErrorState, Loading, PageHeader, Section, SourceNote, StatusBadge, VersionBadge } from '@/components/common';
import { MarkIcon } from '@/lib/game-assets';
import { Badge, Input, Select } from '@/components/ui';
import { displayName } from '@/lib/utils';

export function BossesPage() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const list = useQuery({
    queryKey: ['bosses', q, type],
    queryFn: () => api<{ items: Pick<Boss, 'slug' | 'nameEn' | 'nameFr' | 'type' | 'hp' | 'floors' | 'mask'>[] }>(`/api/bosses${qs({ q, type })}`, { auth: false }),
    placeholderData: (p) => p,
  });
  return (
    <div>
      <PageHeader icon={<Skull />} title="Boss et mini-boss" subtitle="Points de vie de base (quand ils sont connus), étages d'apparition, comportement, récompenses et stratégies." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un boss…" className="pl-9" aria-label="Rechercher un boss" />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-48" aria-label="Type">
          <option value="">Boss et mini-boss</option>
          <option value="boss">Boss</option>
          <option value="mini-boss">Mini-boss</option>
        </Select>
      </div>
      {list.isLoading && <Loading />}
      {list.data?.items.length === 0 && <EmptyState>Aucun boss trouvé.</EmptyState>}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {list.data?.items.map((b) => (
          <Link key={b.slug} to={`/boss/${b.slug}`} className="panel card-hover flex items-center gap-3 p-3">
            <Sprite kind="boss" id={b.slug} size={44} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{displayName(b)}</span>
                <VersionBadge mask={b.mask} />
              </div>
              <div className="text-xs text-muted">
                {b.type === 'boss' ? 'Boss' : 'Mini-boss'}
                {b.hp !== null && ` · ${b.hp} PV de base`}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function BossDetailPage() {
  const { slug = '' } = useParams();
  const q = useQuery({
    queryKey: ['boss', slug],
    queryFn: () => api<{ boss: Boss; floors: Floor[]; marks: CompletionMark[]; achievements: Achievement[] }>(`/api/bosses/${slug}`, { auth: false }),
  });
  const { model } = useProgressModel();
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const b = q.data.boss;
  return (
    <div className="space-y-5">
      <Link to="/boss" className="text-sm text-muted hover:text-ink">← Tous les boss</Link>
      <PageHeader
        kicker={b.type === 'boss' ? 'Boss' : 'Mini-boss'}
        title={<span className="flex items-center gap-4"><Sprite kind="boss" id={b.slug} size={64} /><span><span className="block">{displayName(b)}</span>{b.nameFr && b.nameFr !== b.nameEn && <span className="block text-base text-muted">{b.nameFr}</span>}</span></span>}
        actions={<VersionBadge mask={b.mask} />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {b.behavior && <Section title="Attaques et patterns (wiki, anglais)"><Markup text={b.behavior} /></Section>}
          {b.strategy && <Section title="Conseils de combat (wiki, anglais)"><Markup text={b.strategy} /></Section>}
          {b.notes && (
            <Section title="Notes (wiki, anglais)">
              <details><summary className="cursor-pointer text-sm text-muted">Afficher</summary><Markup text={b.notes} className="mt-3 text-sm" /></details>
            </Section>
          )}
          {!b.behavior && !b.strategy && <EmptyState>Pas de description détaillée disponible dans la source pour ce boss.</EmptyState>}
        </div>
        <div className="space-y-4">
          <Section title="Fiche">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">PV de base</dt>
              <dd className="font-display text-parchment">{b.hp ?? 'non renseigné'}</dd>
              {b.entityId !== null && (<><dt className="text-muted">Entité</dt><dd>{b.entityId}.{b.variant}</dd></>)}
            </dl>
            {q.data.marks.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">{q.data.marks.map((m) => <Badge key={m.key} variant="blood"><MarkIcon markKey={m.key} state="hard" size={10} className="-my-1 -ml-1" />Marque : {m.nameFr}</Badge>)}</div>
            )}
          </Section>
          {b.rewards && <Section title="Récompenses"><Markup text={b.rewards} className="text-sm" /></Section>}
          {q.data.floors.length > 0 && (
            <Section title="Étages">
              <div className="flex flex-wrap gap-1.5">
                {q.data.floors.map((f) => <Link key={f.slug} to={`/etages/${f.slug}`}><Badge variant="parchment">{displayName(f)}</Badge></Link>)}
              </div>
            </Section>
          )}
          {q.data.achievements.length > 0 && (
            <Section title="Succès liés">
              <ul className="space-y-1 text-sm">
                {q.data.achievements.slice(0, 20).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <Link to={`/succes/${a.id}`} className="truncate hover:underline">{a.name}</Link>
                    <StatusBadge status={model?.statuses.get(a.id)} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
      <SourceNote source={b.source} />
    </div>
  );
}
