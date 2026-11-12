import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Search, Trophy } from 'lucide-react';
import { VERSIONS, type Achievement, type EffectiveStatus, type MarkUnlock } from '@isaac-codex/shared';
import { api } from '@/lib/api';
import { useMeta, useProgressModel } from '@/lib/queries';
import { Markup } from '@/components/Markup';
import { EmptyState, ErrorState, Loading, PageHeader, Pagination, Section, SourceNote, StatTile, StatusBadge, StatusControl, VersionBadge } from '@/components/common';
import { Input, Progress, Select } from '@/components/ui';
import { ACH_KIND_FR, REWARD_KIND_FR, displayName, entityHref, formatPct } from '@/lib/utils';

const PAGE = 40;

function RewardLink({ a }: { a: Achievement }) {
  const kindMap: Record<string, string> = { item: 'item', trinket: 'trinket', consumable: 'consumable', character: 'character', floor: 'floor' };
  const kind = kindMap[a.reward.kind];
  return (
    <span className="text-xs text-muted">
      Récompense : {kind && a.reward.key ? <Link className="text-parchment hover:underline" to={entityHref(kind, a.reward.key)}>{a.reward.label}</Link> : a.reward.label}
      {' '}({REWARD_KIND_FR[a.reward.kind]})
    </span>
  );
}

export function UnlocksPage() {
  const { model, isLoading, error } = useProgressModel();
  const meta = useMeta();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | EffectiveStatus>('');
  const [kind, setKind] = useState('');
  const [reward, setReward] = useState('');
  const [character, setCharacter] = useState('');
  const [version, setVersion] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!model) return [];
    const needle = q.trim().toLowerCase();
    return model.ctx.achievements.filter((a) => {
      if (!version && !(a.mask & model.bit)) return false;
      if (version && !(a.mask & VERSIONS.find((v) => v.key === version)!.bit)) return false;
      if (status && model.statuses.get(a.id) !== status) return false;
      if (kind && a.kind !== kind) return false;
      if (reward && a.reward.kind !== reward) return false;
      if (character && a.characterSlug !== character) return false;
      if (needle && !`${a.name} ${a.requirementText} ${a.reward.label} #${a.id}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [model, q, status, kind, reward, character, version]);

  if (isLoading) return <Loading />;
  if (error || !model) return <ErrorState error={error} />;
  const s = model.stats;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = filtered.slice((page - 1) * PAGE, page * PAGE);
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Trophy />}
        title="Suivi des déblocages"
        subtitle="Les succès liés aux marques et aux dons se valident automatiquement selon votre progression déclarée ; vous pouvez aussi définir un statut manuellement."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Complétion globale" value={formatPct(s.global.pct)} sub={`${s.global.done} / ${s.global.total} succès`} tone="blood" />
        <StatTile label="Marques de complétion" value={formatPct(s.marks.pct)} sub={`${s.marks.done} / ${s.marks.total}`} />
        <StatTile label="Objectifs restants" value={s.remaining} />
        <StatTile label="Disponibles maintenant" value={[...model.statuses.entries()].filter(([id, st]) => st === 'available' && (model.ctx.achievements.find((a) => a.id === id)!.mask & model.bit)).length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Par type de récompense">
          <ul className="space-y-2 text-sm">
            {s.byRewardKind.map((r) => (
              <li key={r.kind}>
                <div className="flex justify-between"><span>{REWARD_KIND_FR[r.kind]}</span><span className="text-muted">{r.ratio.done}/{r.ratio.total}</span></div>
                <Progress value={r.ratio.pct} className="mt-1 h-1.5" tone="parchment" />
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Par catégorie">
          <ul className="space-y-2 text-sm">
            {s.byKind.map((r) => (
              <li key={r.kind}>
                <div className="flex justify-between"><span>{ACH_KIND_FR[r.kind]}</span><span className="text-muted">{r.ratio.done}/{r.ratio.total}</span></div>
                <Progress value={r.ratio.pct} className="mt-1 h-1.5" tone="parchment" />
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Par version d'ajout">
          <ul className="space-y-2 text-sm">
            {s.byVersion.map((r) => (
              <li key={r.bit}>
                <div className="flex justify-between"><span>{VERSIONS.find((v) => v.bit === r.bit)!.label}</span><span className="text-muted">{r.ratio.done}/{r.ratio.total}</span></div>
                <Progress value={r.ratio.pct} className="mt-1 h-1.5" tone="parchment" />
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Progression par personnage">
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {s.byCharacter.map((c) => (
            <Link key={c.slug} to={`/personnages/${c.slug}`} className="rounded p-1 text-sm hover:bg-surface-2">
              <div className="flex justify-between"><span className="truncate">{c.name}</span><span className="text-muted">{c.marks.done}/{c.marks.total} marques · {c.unlocks.done}/{c.unlocks.total}</span></div>
              <Progress value={c.unlocks.pct} className="mt-1 h-1.5" />
            </Link>
          ))}
        </div>
      </Section>

      <Section title={`Objectifs (${filtered.length})`}>
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => reset(() => setQ(e.target.value))} placeholder="Nom, condition, récompense…" className="pl-9" aria-label="Filtrer les succès" data-testid="unlocks-search" />
          </div>
          <Select aria-label="État" value={status} onChange={(e) => reset(() => setStatus(e.target.value as EffectiveStatus | ''))}>
            <option value="">Tous les états</option>
            <option value="locked">Verrouillés</option>
            <option value="available">Disponibles</option>
            <option value="in_progress">En cours</option>
            <option value="unlocked">Débloqués</option>
          </Select>
          <Select aria-label="Catégorie" value={kind} onChange={(e) => reset(() => setKind(e.target.value))}>
            <option value="">Toutes catégories</option>
            {Object.entries(ACH_KIND_FR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select aria-label="Récompense" value={reward} onChange={(e) => reset(() => setReward(e.target.value))}>
            <option value="">Toutes récompenses</option>
            {Object.entries(REWARD_KIND_FR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select aria-label="Personnage" value={character} onChange={(e) => reset(() => setCharacter(e.target.value))}>
            <option value="">Tous personnages</option>
            {meta.data?.characters.map((c) => <option key={c.slug} value={c.slug}>{displayName(c)}</option>)}
          </Select>
          <Select aria-label="Version" value={version} onChange={(e) => reset(() => setVersion(e.target.value))} className="lg:col-start-6">
            <option value="">Ma version</option>
            {VERSIONS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </Select>
        </div>
        {current.length === 0 ? (
          <EmptyState>Aucun objectif ne correspond.</EmptyState>
        ) : (
          <ul className="divide-y divide-parchment/5" data-testid="unlocks-list">
            {current.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between" data-testid="unlock-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-xs text-faint">#{a.id}</span>
                    <Link to={`/succes/${a.id}`} className="font-medium text-parchment hover:underline">{a.name}</Link>
                    <VersionBadge mask={a.mask} />
                    <span className="text-xs text-faint">difficulté estimée {a.difficulty}/5</span>
                  </div>
                  <Markup text={a.requirement} inline className="block text-sm" />
                  <RewardLink a={a} />
                </div>
                <StatusControl achievementId={a.id} status={model.statuses.get(a.id)} />
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pages={pages} onPage={setPage} />
      </Section>
    </div>
  );
}

export function AchievementDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['achievement', id],
    queryFn: () => api<{ achievement: Achievement; prerequisites: Achievement[]; unlocks: Achievement[]; markUnlock: MarkUnlock | null }>(`/api/unlocks/${id}`, { auth: false }),
  });
  const { model } = useProgressModel();
  const meta = useMeta();
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const a = q.data.achievement;
  const status = model?.statuses.get(a.id);
  const character = meta.data?.characters.find((c) => c.slug === a.characterSlug);
  return (
    <div className="space-y-5">
      <Link to="/succes" className="text-sm text-muted hover:text-ink">← Suivi des déblocages</Link>
      <PageHeader kicker={`Succès #${a.id} · ${ACH_KIND_FR[a.kind]}`} title={a.name} subtitle={a.description} actions={<VersionBadge mask={a.mask} />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Condition exacte" className="lg:col-span-2">
          <Markup text={a.requirement} />
          <div className="mt-4"><RewardLink a={a} /></div>
          {q.data.markUnlock && (
            <p className="mt-2 text-sm text-muted">
              Lié aux marques : {q.data.markUnlock.marks.map((m) => meta.data?.completionMarks.find((x) => x.key === m)?.nameFr ?? m).join(' + ')}
              {q.data.markUnlock.hard ? ' en mode difficile' : ''} — se valide automatiquement quand vous cochez ces marques.
            </p>
          )}
        </Section>
        <Section title="Mon état">
          <StatusControl achievementId={a.id} status={status} />
          <p className="mt-3 text-xs text-faint">Difficulté estimée {a.difficulty}/5 (calculée, indicative).</p>
          {character && <Link to={`/personnages/${character.slug}`} className="mt-2 block text-sm text-parchment hover:underline">Personnage : {displayName(character)}</Link>}
        </Section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Prérequis">
          {q.data.prerequisites.length ? (
            <ul className="space-y-1">
              {q.data.prerequisites.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2"><Link to={`/succes/${p.id}`} className="hover:underline">{p.name}</Link><StatusBadge status={model?.statuses.get(p.id)} /></li>
              ))}
            </ul>
          ) : <p className="text-muted">Aucun prérequis connu.</p>}
        </Section>
        <Section title="Ouvre la voie à">
          {q.data.unlocks.length ? (
            <ul className="space-y-1">
              {q.data.unlocks.slice(0, 30).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2"><Link to={`/succes/${p.id}`} className="hover:underline">{p.name}</Link><StatusBadge status={model?.statuses.get(p.id)} /></li>
              ))}
            </ul>
          ) : <p className="text-muted">Aucun objectif ne dépend directement de celui-ci.</p>}
        </Section>
      </div>
      <SourceNote source={a.source} />
    </div>
  );
}
