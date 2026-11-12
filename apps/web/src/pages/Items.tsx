import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Gem, Search, SlidersHorizontal, X } from 'lucide-react';
import { VERSIONS, markupToText, type Consumable, type Trinket } from '@isaac-codex/shared';
import { api, qs } from '@/lib/api';
import { useMeta, useProgress } from '@/lib/queries';
import { Sprite } from '@/components/Sprite';
import { EmptyState, ErrorState, Loading, PageHeader, Pagination, QualityBadge, VersionBadge } from '@/components/common';
import { Badge, Button, Input, Label, Select, Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { CONSUMABLE_KIND_FR, cn, displayName } from '@/lib/utils';
import { consumableIcon } from '@/lib/game-assets';

interface ItemSummary {
  id: number;
  slug: string;
  kind: 'active' | 'passive';
  familiar: boolean;
  nameEn: string;
  nameFr: string | null;
  quote: string | null;
  quality: number | null;
  qualityRepPlus: number | null;
  mask: number;
  pools: string[];
  transformations: string[];
  description: string;
}
interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

type Tab = 'all' | 'active' | 'passive' | 'familiar' | 'trinkets' | 'consumables';

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ItemsPage() {
  const [params, setParams] = useSearchParams();
  const meta = useMeta();
  const { data: progress } = useProgress();
  const [showFilters, setShowFilters] = useState(false);
  const tab = (params.get('type') as Tab) || 'all';
  const [text, setText] = useState(params.get('q') ?? '');
  const q = useDebounced(text);
  const page = Number(params.get('page') ?? 1);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) set({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const isItems = !['trinkets', 'consumables'].includes(tab);
  const filters = {
    q: params.get('q'),
    quality: params.get('quality'),
    pool: params.get('pool'),
    version: params.get('version'),
    transformation: params.get('transformation'),
    tag: params.get('tag'),
    unlocked: params.get('unlocked'),
    favorites: params.get('favorites'),
    sort: params.get('sort'),
    kind: params.get('ckind'),
  };
  const query = useQuery<Page<ItemSummary | Trinket | Consumable>>({
    queryKey: ['items-list', tab, filters, page, progress?.profileId],
    placeholderData: keepPreviousData,
    queryFn: () => {
      if (tab === 'trinkets') return api<Page<Trinket>>(`/api/trinkets${qs({ q: filters.q, version: filters.version, page, pageSize: 48 })}`);
      if (tab === 'consumables') return api<Page<Consumable>>(`/api/consumables${qs({ q: filters.q, kind: filters.kind, page, pageSize: 48 })}`);
      return api<Page<ItemSummary>>(
        `/api/items${qs({
          q: filters.q,
          kind: tab === 'all' ? undefined : tab,
          quality: filters.quality,
          pool: filters.pool,
          version: filters.version,
          transformation: filters.transformation,
          tag: filters.tag,
          unlocked: filters.unlocked,
          favorites: filters.favorites,
          sort: filters.sort,
          page,
          pageSize: 48,
        })}`,
      );
    },
  });

  const activeFilters = Object.entries(filters).filter(([k, v]) => v && k !== 'q' && k !== 'sort');
  const qualities = (filters.quality ?? '').split(',').filter(Boolean);
  const toggleQuality = (n: string) => set({ quality: (qualities.includes(n) ? qualities.filter((x) => x !== n) : [...qualities, n]).join(',') || null });

  return (
    <div>
      <PageHeader
        icon={<Gem />}
        title="Objets"
        subtitle="Objets actifs et passifs, familiers, trinkets, cartes, runes, pierres d'âme et pilules. Recherche tolérante aux fautes de frappe, en français ou en anglais."
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nom (FR/EN), identifiant…"
              className="pl-9"
              aria-label="Rechercher un objet"
              data-testid="items-search"
            />
          </div>
          <Button variant="outline" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} className="lg:hidden">
            <SlidersHorizontal /> Filtres {activeFilters.length > 0 && `(${activeFilters.length})`}
          </Button>
        </div>
        <Tabs value={tab} onValueChange={(v) => set({ type: v === 'all' ? null : v })}>
          <TabsList>
            <TabsTrigger value="all">Tous</TabsTrigger>
            <TabsTrigger value="active">Actifs</TabsTrigger>
            <TabsTrigger value="passive">Passifs</TabsTrigger>
            <TabsTrigger value="familiar">Familiers</TabsTrigger>
            <TabsTrigger value="trinkets">Trinkets</TabsTrigger>
            <TabsTrigger value="consumables">Consommables</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex gap-5">
        <aside className={cn('w-full shrink-0 space-y-4 lg:block lg:w-60', showFilters ? 'block' : 'hidden')}>
          <div className="panel space-y-4 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="f-version">Version</Label>
              <Select id="f-version" value={filters.version ?? ''} onChange={(e) => set({ version: e.target.value || null })}>
                <option value="">Toutes</option>
                {VERSIONS.map((v) => (
                  <option key={v.key} value={v.key}>{v.label}</option>
                ))}
              </Select>
            </div>
            {tab === 'consumables' && (
              <div className="space-y-1.5">
                <Label htmlFor="f-ckind">Type</Label>
                <Select id="f-ckind" value={filters.kind ?? ''} onChange={(e) => set({ ckind: e.target.value || null })}>
                  <option value="">Tous</option>
                  {Object.entries(CONSUMABLE_KIND_FR).map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
                </Select>
              </div>
            )}
            {isItems && (
              <>
                <div className="space-y-1.5">
                  <Label>Qualité</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {['0', '1', '2', '3', '4'].map((n) => (
                      <button
                        key={n}
                        onClick={() => toggleQuality(n)}
                        aria-pressed={qualities.includes(n)}
                        className={cn('rounded-md px-2.5 py-1 font-display text-sm ring-1', qualities.includes(n) ? 'bg-surface-3 ring-parchment/60' : 'ring-parchment/15 text-muted')}
                      >
                        Q{n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-pool">Pool d'objets</Label>
                  <Select id="f-pool" value={filters.pool ?? ''} onChange={(e) => set({ pool: e.target.value || null })}>
                    <option value="">Tous</option>
                    {meta.data?.pools.map((p) => (
                      <option key={p.key} value={p.key}>{p.nameFr ?? p.nameEn}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-tr">Transformation</Label>
                  <Select id="f-tr" value={filters.transformation ?? ''} onChange={(e) => set({ transformation: e.target.value || null })}>
                    <option value="">Toutes</option>
                    {meta.data?.transformations.map((t) => (
                      <option key={t.slug} value={t.slug}>{t.nameFr ?? t.nameEn}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-tag">Effet / étiquette</Label>
                  <Select id="f-tag" value={filters.tag ?? ''} onChange={(e) => set({ tag: e.target.value || null })}>
                    <option value="">Toutes</option>
                    {meta.data?.tags.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-unl">Débloqué (selon mon profil)</Label>
                  <Select id="f-unl" value={filters.unlocked ?? ''} onChange={(e) => set({ unlocked: e.target.value || null })}>
                    <option value="">Indifférent</option>
                    <option value="yes">Débloqués</option>
                    <option value="no">Pas encore débloqués</option>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={filters.favorites === 'yes'} onChange={(e) => set({ favorites: e.target.checked ? 'yes' : null })} className="accent-[var(--color-blood)]" />
                  Favoris uniquement
                </label>
                <div className="space-y-1.5">
                  <Label htmlFor="f-sort">Tri</Label>
                  <Select id="f-sort" value={filters.sort ?? 'id'} onChange={(e) => set({ sort: e.target.value === 'id' ? null : e.target.value })}>
                    <option value="id">Identifiant</option>
                    <option value="name">Nom</option>
                    <option value="quality">Qualité</option>
                  </Select>
                </div>
              </>
            )}
            {activeFilters.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setParams(tab === 'all' ? {} : { type: tab })}>
                <X /> Réinitialiser
              </Button>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {query.isLoading && <Loading />}
          {query.error && <ErrorState error={query.error} />}
          {query.data && (
            <>
              <p className="mb-3 text-sm text-muted" data-testid="items-count">
                {query.data.total} résultat{query.data.total > 1 ? 's' : ''}
                {query.isFetching && ' · mise à jour…'}
              </p>
              {query.data.total === 0 ? (
                <EmptyState>Aucun élément ne correspond à ces critères.</EmptyState>
              ) : (
                <div className={cn('grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3', query.isFetching && 'opacity-70')}>
                  {tab === 'trinkets' &&
                    (query.data.items as Trinket[]).map((t) => (
                      <Link key={t.id} to={`/trinkets/${t.id}`} className="panel card-hover flex gap-3 p-3" data-testid="item-card">
                        <Sprite kind="trinket" id={t.id} size={48} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-ink">{displayName(t)}</span>
                            <VersionBadge mask={t.mask} />
                          </div>
                          <div className="text-xs text-faint">Trinket #{t.id}{t.nameFr && t.nameFr !== t.nameEn ? ` · ${t.nameEn}` : ''}</div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted">{markupToText(t.description)}</p>
                        </div>
                      </Link>
                    ))}
                  {tab === 'consumables' &&
                    (query.data.items as Consumable[]).map((c) => (
                      <Link key={c.slug} to={`/consommables/${c.slug}`} className="panel card-hover flex gap-3 p-3" data-testid="item-card">
                        <Sprite kind="consumable" id={c.slug} size={48} src={consumableIcon(c)} className="bg-transparent ring-0 object-contain" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-ink">{displayName(c)}</span>
                            <VersionBadge mask={c.mask} />
                          </div>
                          <div className="text-xs text-faint">{CONSUMABLE_KIND_FR[c.kind]}{c.polarity === 'negative' ? ' · négative' : c.polarity === 'positive' ? ' · positive' : ''}</div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted">{markupToText(c.description)}</p>
                        </div>
                      </Link>
                    ))}
                  {isItems &&
                    (query.data.items as ItemSummary[]).map((i) => (
                      <Link key={i.id} to={`/objets/${i.id}`} className="panel card-hover flex gap-3 p-3" data-testid="item-card">
                        <Sprite kind="item" id={i.id} quality={i.quality} size={48} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-ink">{displayName(i)}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-faint">
                            #{i.id} · {i.kind === 'active' ? 'Actif' : 'Passif'}
                            {i.familiar && <Badge variant="muted">Familier</Badge>}
                            <QualityBadge quality={i.quality} repPlus={i.qualityRepPlus} />
                            <VersionBadge mask={i.mask} />
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted">{i.quote ? `« ${i.quote} » — ` : ''}{markupToText(i.description)}</p>
                        </div>
                      </Link>
                    ))}
                </div>
              )}
              <Pagination page={query.data.page} pages={query.data.pages} onPage={(p) => set({ page: String(p) })} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
