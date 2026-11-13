import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, Eye, Hand } from 'lucide-react';
import type { Achievement, Consumable, Item, Pool, Synergy, Transformation, Trinket } from '@isaac-codex/shared';
import { maskLabel } from '@isaac-codex/shared';
import { api } from '@/lib/api';
import { usePatchProgress, useProgress, useProgressModel, useRecordView, useVersionBit, type CharacterSummary } from '@/lib/queries';
import { Markup } from '@/components/Markup';
import { Sprite } from '@/components/Sprite';
import { EntityChip, ErrorState, FavoriteButton, Loading, PageHeader, QualityBadge, Section, SourceNote, StatusBadge, StatusControl, VersionBadge } from '@/components/common';
import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger, Tip } from '@/components/ui';
import { CONSUMABLE_KIND_FR, cn, displayName } from '@/lib/utils';
import { asset, consumableIcon, GameIcon, poolIcon } from '@/lib/game-assets';

type SynergyView = Synergy & { direction: 'in' | 'out'; other: { kind: string; key: string; name: string; nameFr: string | null; exists: boolean } };

function SynergyList({ list, emptyLabel }: { list: SynergyView[]; emptyLabel: string }) {
  const bit = useVersionBit();
  if (!list.length) return <p className="text-muted">{emptyLabel}</p>;
  return (
    <ul className="space-y-2">
      {list.map((s, i) => {
        const out = s.mask !== null && (s.mask & bit) === 0;
        return (
          <li key={i} className={cn('rounded-md border border-parchment/10 bg-abyss/40 p-3', out && 'opacity-50')} title={out ? `Ne concerne pas votre version (${maskLabel(s.mask!)})` : undefined}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <EntityChip kind={s.other.kind as 'item'} id={s.other.key} name={s.other.name} />
              {s.mask !== null && <VersionBadge mask={s.mask} />}
              {s.possiblyNegative && (
                <Tip content="Détection automatique de formulations négatives dans le texte du wiki : à lire attentivement.">
                  <Badge variant="warn" className="cursor-help"><AlertTriangle className="size-3" /> Possiblement négative</Badge>
                </Tip>
              )}
              {s.direction === 'in' && <span className="text-xs text-faint">(documenté sur la fiche de {s.other.name})</span>}
            </div>
            <Markup text={s.text} className="text-sm" />
          </li>
        );
      })}
    </ul>
  );
}

function SynergiesSection({ synergies }: { synergies: SynergyView[] }) {
  const syn = synergies.filter((s) => s.section === 'synergy');
  const inter = synergies.filter((s) => s.section === 'interaction');
  return (
    <Section title="Synergies et interactions" id="synergies">
      <Tabs defaultValue="syn">
        <TabsList>
          <TabsTrigger value="syn">Synergies ({syn.length})</TabsTrigger>
          <TabsTrigger value="int">Interactions ({inter.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="syn" className="mt-3">
          <SynergyList list={syn} emptyLabel="Aucune synergie documentée par la source." />
        </TabsContent>
        <TabsContent value="int" className="mt-3">
          <SynergyList list={inter} emptyLabel="Aucune interaction documentée par la source." />
        </TabsContent>
      </Tabs>
      <p className="mt-3 text-xs text-faint">Synergies et interactions issues exclusivement des pages du wiki (texte en anglais). Aucune n'est inventée ou déduite.</p>
    </Section>
  );
}

function UnlockSection({ achievement }: { achievement: Achievement | null }) {
  const { model } = useProgressModel();
  if (!achievement) return <p className="text-muted">Disponible dès le départ (aucun déblocage requis).</p>;
  const status = model?.statuses.get(achievement.id);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        <Link to={`/succes/${achievement.id}`} className="text-parchment hover:underline">Succès « {achievement.name} »</Link>
        {achievement.characterSlug && (
          <Link to={`/personnages/${achievement.characterSlug}`} className="text-xs text-muted hover:underline">voir le personnage</Link>
        )}
      </div>
      <Markup text={achievement.requirement} />
      <StatusControl achievementId={achievement.id} status={status} compact />
    </div>
  );
}

function EncounterButtons({ kind, id }: { kind: 'item' | 'trinket'; id: string }) {
  const { data: progress } = useProgress();
  const patch = usePatchProgress();
  const status = progress?.items[`${kind}:${id}`];
  const setStatus = (s: 'seen' | 'collected') => patch.mutate({ items: [{ kind, key: id, status: status === s ? null : s }] });
  return (
    <div className="flex gap-2">
      <Tip content="Rencontré pendant une partie (indépendant des déblocages)">
        <Button size="sm" variant={status === 'seen' ? 'parchment' : 'outline'} onClick={() => setStatus('seen')} disabled={!progress} aria-pressed={status === 'seen'}>
          <Eye /> Vu
        </Button>
      </Tip>
      <Tip content="Ramassé au moins une fois (page de collection)">
        <Button size="sm" variant={status === 'collected' ? 'parchment' : 'outline'} onClick={() => setStatus('collected')} disabled={!progress} aria-pressed={status === 'collected'}>
          <Hand /> Ramassé
        </Button>
      </Tip>
    </div>
  );
}

interface ItemResponse {
  item: Item;
  pools: (Item['pools'][number] & { pool: Pool })[];
  unlockAchievement: Achievement | null;
  transformations: Transformation[];
  startingFor: CharacterSummary[];
  synergies: SynergyView[];
  neighbors: { prev: number | null; next: number | null };
}

export function ItemDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['item', id], queryFn: () => api<ItemResponse>(`/api/items/${id}`, { auth: false }) });
  const recordView = useRecordView();
  useEffect(() => {
    if (q.data) recordView('item', id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.item.id]);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const { item, pools } = q.data;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm">
        <Link to="/objets" className="text-muted hover:text-ink">← Tous les objets</Link>
        <div className="flex gap-2">
          {q.data.neighbors.prev && <Button asChild variant="ghost" size="sm"><Link to={`/objets/${q.data.neighbors.prev}`} aria-label="Objet précédent"><ArrowLeft /> #{q.data.neighbors.prev}</Link></Button>}
          {q.data.neighbors.next && <Button asChild variant="ghost" size="sm"><Link to={`/objets/${q.data.neighbors.next}`} aria-label="Objet suivant">#{q.data.neighbors.next} <ArrowRight /></Link></Button>}
        </div>
      </div>
      <PageHeader
        kicker={`Objet ${item.kind === 'active' ? 'actif' : 'passif'} · ID ${item.id}${item.familiar ? ' · familier' : ''}`}
        title={
          <span className="flex items-center gap-4">
            <Sprite kind="item" id={item.id} quality={item.quality} size={72} className="rounded-xl bg-[#141920] p-2 pixel-border" />
            <span>
              <span data-testid="item-title">{displayName(item)}</span>
              {item.nameFr && item.nameFr !== item.nameEn && <span className="block text-base text-muted">{item.nameFr}</span>}
            </span>
          </span>
        }
        actions={
          <>
            <FavoriteButton refKind="item" refKey={String(item.id)} />
            <EncounterButtons kind="item" id={String(item.id)} />
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Description">
            {item.quote && <p className="mb-2 font-display text-lg text-parchment">« {item.quote} »</p>}
            <Markup text={item.description} />
          </Section>
          {item.effects && (
            <Section title="Effets détaillés (wiki, anglais)">
              <Markup text={item.effects} />
            </Section>
          )}
          <SynergiesSection synergies={q.data.synergies} />
          {item.notes && (
            <Section title="Notes et conseils (wiki, anglais)">
              <details open={item.notes.length < 1200}>
                <summary className="cursor-pointer text-sm text-muted">Afficher les notes</summary>
                <Markup text={item.notes} className="mt-3 text-sm" />
              </details>
            </Section>
          )}
        </div>
        <div className="space-y-4">
          <Section title="Caractéristiques">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Qualité</dt>
              <dd><QualityBadge quality={item.quality} repPlus={item.qualityRepPlus} /></dd>
              {item.recharge && (
                <>
                  <dt className="text-muted">Recharge</dt>
                  <dd className="text-parchment">{item.recharge}</dd>
                </>
              )}
              <dt className="text-muted">Versions</dt>
              <dd>{maskLabel(item.mask)}</dd>
              {item.tags.length > 0 && (
                <>
                  <dt className="text-muted">Étiquettes</dt>
                  <dd className="flex flex-wrap gap-1">{item.tags.map((t) => <Link key={t} to={`/objets?tag=${t}`}><Badge variant="muted">{t}</Badge></Link>)}</dd>
                </>
              )}
            </dl>
          </Section>
          <Section title="Déblocage">
            <UnlockSection achievement={q.data.unlockAchievement} />
          </Section>
          <Section title="Pools d'objets">
            {pools.length ? (
              <ul className="space-y-1 text-sm">
                {pools.map((p) => (
                  <li key={`${p.pool.key}-${p.mask}`} className="flex items-center justify-between gap-2">
                    <Link to={`/objets?pool=${encodeURIComponent(p.pool.key)}`} className="flex items-center gap-1.5 hover:underline">
                      <GameIcon src={poolIcon(p.pool.key)} size={14} />
                      {p.pool.nameEn}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-faint">
                      poids {p.weight}
                      <VersionBadge mask={p.mask} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">N'apparaît dans aucun pool (objet spécial, de départ ou obtenu par un moyen particulier).</p>
            )}
          </Section>
          {q.data.transformations.length > 0 && (
            <Section title="Transformations">
              <ul className="space-y-2 text-sm">
                {q.data.transformations.map((t) => (
                  <li key={t.slug}>
                    <Link to={`/synergies?transformation=${t.slug}`} className="flex items-center gap-2 font-display text-lg text-parchment hover:underline">
                      <GameIcon src={asset('transformations', t.slug)} size={22} />
                      {t.nameEn}
                    </Link>
                    <Markup text={t.description} className="text-muted" />
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {q.data.startingFor.length > 0 && (
            <Section title="Objet de départ de">
              <div className="flex flex-wrap gap-2">
                {q.data.startingFor.map((c) => <EntityChip key={c.slug} kind="character" id={c.slug} name={displayName(c)} />)}
              </div>
            </Section>
          )}
        </div>
      </div>
      <SourceNote source={item.source} />
    </div>
  );
}

export function TrinketDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['trinket', id],
    queryFn: () => api<{ trinket: Trinket; unlockAchievement: Achievement | null; synergies: SynergyView[]; startingFor: CharacterSummary[] }>(`/api/trinkets/${id}`, { auth: false }),
  });
  const recordView = useRecordView();
  useEffect(() => {
    if (q.data) recordView('trinket', id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.trinket.id]);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const t = q.data.trinket;
  return (
    <div className="space-y-5">
      <Link to="/objets?type=trinkets" className="text-sm text-muted hover:text-ink">← Tous les trinkets</Link>
      <PageHeader
        kicker={`Trinket · ID ${t.id}`}
        title={
          <span className="flex items-center gap-4">
            <Sprite kind="trinket" id={t.id} size={72} className="rounded-xl bg-[#141920] p-2 pixel-border" />
            <span>
              {displayName(t)}
              {t.nameFr && t.nameFr !== t.nameEn && <span className="block text-base text-muted">{t.nameFr}</span>}
            </span>
          </span>
        }
        actions={<><FavoriteButton refKind="trinket" refKey={String(t.id)} /><EncounterButtons kind="trinket" id={String(t.id)} /></>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Description">
            {t.quote && <p className="mb-2 font-display text-lg text-parchment">« {t.quote} »</p>}
            <Markup text={t.description} />
          </Section>
          {t.effects && <Section title="Effets détaillés (wiki, anglais)"><Markup text={t.effects} /></Section>}
          <SynergiesSection synergies={q.data.synergies} />
          {t.notes && <Section title="Notes (wiki, anglais)"><Markup text={t.notes} className="text-sm" /></Section>}
        </div>
        <div className="space-y-4">
          <Section title="Déblocage"><UnlockSection achievement={q.data.unlockAchievement} /></Section>
          <Section title="Versions"><p>{maskLabel(t.mask)}</p></Section>
          {q.data.startingFor.length > 0 && (
            <Section title="Trinket de départ de">
              <div className="flex flex-wrap gap-2">{q.data.startingFor.map((c) => <EntityChip key={c.slug} kind="character" id={c.slug} name={displayName(c)} />)}</div>
            </Section>
          )}
        </div>
      </div>
      <SourceNote source={t.source} />
    </div>
  );
}

export function ConsumableDetailPage() {
  const { slug = '' } = useParams();
  const q = useQuery({
    queryKey: ['consumable', slug],
    queryFn: () => api<{ consumable: Consumable; unlockAchievement: Achievement | null; synergies: SynergyView[] }>(`/api/consumables/${slug}`, { auth: false }),
  });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const c = q.data.consumable;
  return (
    <div className="space-y-5">
      <Link to="/objets?type=consumables" className="text-sm text-muted hover:text-ink">← Tous les consommables</Link>
      <PageHeader
        kicker={`${CONSUMABLE_KIND_FR[c.kind]}${c.gameId !== null ? ` · ID ${c.gameId}` : ''}`}
        title={
          <span className="flex items-center gap-4">
            <Sprite kind="consumable" id={c.slug} size={72} src={consumableIcon(c)} className="bg-transparent ring-0 object-contain" />
            <span>
              {displayName(c)}
              {c.nameFr && c.nameFr !== c.nameEn && <span className="block text-base text-muted">{c.nameFr}</span>}
            </span>
          </span>
        }
        actions={<FavoriteButton refKind="consumable" refKey={c.slug} />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Effet">
            {c.quote && <p className="mb-2 font-display text-lg text-parchment">« {c.quote} »</p>}
            <Markup text={c.description} />
          </Section>
          {c.horseEffect && <Section title="Effet en Horse Pill (Repentance)"><Markup text={c.horseEffect} /></Section>}
          {c.effects && <Section title="Effets détaillés (wiki, anglais)"><Markup text={c.effects} /></Section>}
          {q.data.synergies.length > 0 && <SynergiesSection synergies={q.data.synergies} />}
          {c.notes && <Section title="Notes (wiki, anglais)"><Markup text={c.notes} className="text-sm" /></Section>}
        </div>
        <div className="space-y-4">
          {c.polarity && (
            <Section title="Polarité">
              <Badge variant={c.polarity === 'positive' ? 'ok' : c.polarity === 'negative' ? 'blood' : 'muted'}>
                {c.polarity === 'positive' ? 'Positive' : c.polarity === 'negative' ? 'Négative' : 'Neutre'}
              </Badge>
            </Section>
          )}
          <Section title="Déblocage"><UnlockSection achievement={q.data.unlockAchievement} /></Section>
          <Section title="Versions"><p>{maskLabel(c.mask)}</p></Section>
        </div>
      </div>
      <SourceNote source={c.source} />
    </div>
  );
}
