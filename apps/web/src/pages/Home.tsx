import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Coins, Dices, Gem, Lightbulb, Map as MapIcon, Search, Skull, Sparkles, Star, Target, Trophy, Users } from 'lucide-react';
import type { Achievement, EntityRef } from '@isaac-codex/shared';
import { api, qs } from '@/lib/api';
import { useItemIndex, useMeta, useProgress, useProgressModel } from '@/lib/queries';
import { Markup } from '@/components/Markup';
import { Sprite } from '@/components/Sprite';
import { EmptyState, PageHeader, Section, StatTile, StatusBadge } from '@/components/common';
import { Button, Card, Progress } from '@/components/ui';
import { SearchCommand } from '@/components/SearchCommand';
import { cn, displayName, entityHref, formatPct } from '@/lib/utils';
import { asset } from '@/lib/game-assets';

export interface RecommendationView {
  achievementId: number;
  score: number;
  status: 'available' | 'in_progress';
  reasons: string[];
  warnings: string[];
  pathSlugs: string[];
  achievement: Achievement;
}

export function useRecommendations(limit = 12, character?: string) {
  const { data: progress } = useProgress();
  return useQuery({
    queryKey: ['recommendations', progress?.profileId, limit, character, progress?.settings],
    enabled: !!progress,
    queryFn: () =>
      api<{ recommendations: RecommendationView[]; disclaimer: string }>(`/api/profiles/${progress!.profileId}/recommendations${qs({ limit, character })}`),
    staleTime: 10_000,
  });
}

const QUICK = [
  { to: '/personnages', label: 'Personnages', desc: '34 personnages, marques et déblocages', icon: <Users /> },
  { to: '/objets', label: 'Objets', desc: 'Objets, trinkets, cartes, runes, pilules', icon: <Gem /> },
  { to: '/succes', label: 'Déblocages', desc: 'Suivi des 641 succès', icon: <Trophy /> },
  { to: '/synergies', label: 'Synergies', desc: 'Interactions documentées', icon: <Sparkles /> },
  { to: '/guides', label: 'Guides', desc: 'Stratégies en français', icon: <BookOpen /> },
  { to: '/boss', label: 'Boss', desc: 'Patterns, PV et récompenses', icon: <Skull /> },
  { to: '/etages', label: 'Étages & routes', desc: 'Chemins vers chaque fin', icon: <MapIcon /> },
  { to: '/dons', label: 'Machines de dons', desc: 'Paliers et progression', icon: <Coins /> },
];

function RefLink({ r }: { r: EntityRef }) {
  const index = useItemIndex();
  const meta = useMeta();
  let name = r.key;
  let quality: number | null | undefined;
  if (r.kind === 'item') {
    const it = index.data?.items.find((i) => String(i.id) === r.key);
    name = displayName(it) || name;
    quality = it?.quality;
  } else if (r.kind === 'trinket') name = displayName(index.data?.trinkets.find((i) => String(i.id) === r.key)) || name;
  else if (r.kind === 'character') name = displayName(meta.data?.characters.find((c) => c.slug === r.key)) || name;
  const spriteKind = ['item', 'trinket', 'consumable', 'character', 'boss', 'floor'].includes(r.kind) ? (r.kind as 'item') : null;
  return (
    <Link to={entityHref(r.kind, r.key)} className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-surface-2">
      {spriteKind && <Sprite kind={spriteKind} id={r.key} quality={quality} size={28} />}
      <span className="truncate text-sm">{name}</span>
    </Link>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const { model, progress } = useProgressModel();
  const recos = useRecommendations(4);
  const tip = useQuery({ queryKey: ['tip'], queryFn: () => api<{ text: string; source: string } | null>('/api/tips/random', { auth: false }), staleTime: Infinity });
  const [rolling, setRolling] = useState(false);

  const randomItem = async () => {
    setRolling(true);
    try {
      const r = await api<{ id: number }>(`/api/random/item${qs({ version: progress?.settings.gameVersion })}`, { auth: false });
      navigate(`/objets/${r.id}`);
    } finally {
      setRolling(false);
    }
  };
  const next = recos.data?.recommendations[0];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Vue d’ensemble"
        title="Ton codex de la cave"
        subtitle="Objets, personnages, déblocages et synergies de The Binding of Isaac, avec le suivi de ta progression."
        actions={<span className="text-[11px] text-[#738393]">{new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
      />

      <section className="grid min-h-[292px] overflow-hidden rounded-[18px] border border-[#593039] bg-[#141316] animate-rise md:grid-cols-2">
        <div className="relative z-10 bg-gradient-to-r from-[#1c151a] to-[#131519] px-6 py-7 sm:px-8">
          <span className="inline-flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#c0a2ac]">
            <i className="size-[5px] rounded-full bg-[#ff5269] shadow-[0_0_12px_#ff4157]" /> Rebirth → Repentance+ · non officiel
          </span>
          <h2 className="mb-3 mt-4 text-[clamp(27px,2.5vw,40px)] leading-[1.12] tracking-[-0.04em] text-parchment">
            Prêt pour la <em className="not-italic text-[#ff677b]">prochaine run ?</em>
          </h2>
          <p className="max-w-md text-xs leading-[1.8] text-[#9a9fac]">
            Cherche un objet, prépare un build ou trouve le prochain déblocage à viser. Tout est en français et ta progression est sauvegardée.
          </p>
          <button
            onClick={() => setSearchOpen(true)}
            className="mt-5 flex h-11 w-full max-w-md items-center gap-2.5 rounded-lg border border-[#272f39] bg-[#141920] px-3 text-left text-xs text-[#8996a7] transition-colors hover:border-[#3d4856]"
          >
            <Search className="size-4" /> Brimstone, D6, 105…
          </button>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button onClick={randomItem} disabled={rolling}>
              <Dices /> Objet aléatoire
            </Button>
            <Button asChild variant="outline">
              <Link to="/planificateur">
                <Target /> Que débloquer ensuite ?
              </Link>
            </Button>
          </div>
        </div>
        <div className="relative hidden min-w-0 overflow-hidden bg-[radial-gradient(ellipse_at_60%_45%,#5a1420_0%,#2a0d14_45%,#120a0e_80%)] md:block">
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,#ffffff05_0_1px,transparent_1px_4px)]" />
          {asset('ui', 'logo') && <img src={asset('ui', 'logo')} alt="The Binding of Isaac: Repentance" className="absolute left-1/2 top-[44%] w-[78%] max-w-[460px] -translate-x-1/2 -translate-y-1/2 [image-rendering:pixelated] drop-shadow-[0_10px_30px_#000a]" />}
          <span className="brand-font absolute bottom-5 left-6 text-[22px] text-white">ISAAC CODEX</span>
          <span className="absolute bottom-6 right-6 text-[8px] font-medium tracking-[0.2em] text-[#d0b7bf]">BUILT FOR THE BASEMENT.</span>
          <div className="absolute bottom-3 right-1/3 flex gap-1 opacity-90">
            {['105', '118', '182'].map((id) => (
              <Sprite key={id} kind="item" id={id} size={32} className="drop-shadow-[2px_3px_0_rgb(0_0_0/0.5)]" />
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {QUICK.map((q) => (
          <Link key={q.to} to={q.to} className="card-hover flex items-start gap-3 rounded-[10px] border border-line bg-gradient-to-br from-[#161c23] to-[#12171d] p-4">
            <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-[#3c1c29] text-[#f97b91] [&_svg]:size-[18px]">{q.icon}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-parchment">{q.label}</span>
              <span className="mt-1 block text-[11px] leading-snug text-[#748499]">{q.desc}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Ma progression" className="lg:col-span-2" actions={<Link to="/succes" className="text-[11px] text-[#ff7586] hover:text-blood-bright">Détails →</Link>}>
          {model ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Succès" value={formatPct(model.stats.global.pct)} sub={`${model.stats.global.done} / ${model.stats.global.total}`} />
                <StatTile label="Marques" value={formatPct(model.stats.marks.pct)} sub={`${model.stats.marks.done} / ${model.stats.marks.total}`} />
                <StatTile label="Dons (boutique)" value={progress?.donations.donation ?? 0} sub="sur 999" />
                <StatTile label="Dons (Greed)" value={progress?.donations.greed ?? 0} sub="sur 1000" />
              </div>
              <Progress value={model.stats.global.pct} className="mt-4" />
              <p className="mt-2 text-xs text-faint">
                Version suivie : {progress?.settings.gameVersion === 'repentanceplus' ? 'Repentance+' : progress?.settings.gameVersion} — {model.stats.remaining} objectifs restants.
              </p>
            </>
          ) : (
            <p className="text-muted">Chargement de votre profil…</p>
          )}
        </Section>

        <Section title="Objectif actuel">
          {next ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={next.status} />
                <span className="text-xs text-faint">score {next.score}</span>
              </div>
              <Link to={`/succes/${next.achievementId}`} className="text-lg font-semibold text-parchment hover:text-blood-bright">
                {next.achievement.name}
              </Link>
              <Markup text={next.achievement.requirement} className="text-sm" />
              <ul className="text-xs text-muted">
                {next.reasons.slice(0, 3).map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted">Aucune recommandation pour l'instant.</p>
          )}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Déblocages recommandés" actions={<Link to="/planificateur" className="text-[11px] text-[#ff7586] hover:text-blood-bright">Tout voir →</Link>}>
          <ul className="space-y-2">
            {recos.data?.recommendations.slice(0, 4).map((r) => (
              <li key={r.achievementId}>
                <Link to={`/succes/${r.achievementId}`} className="block rounded-lg p-2 hover:bg-surface-2">
                  <span className="text-[13px] font-medium text-ink">{r.achievement.name}</span>
                  <span className="block truncate text-xs text-muted">{r.achievement.requirementText}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Derniers consultés">
          {progress?.history.length ? (
            <div className="grid gap-1">
              {progress.history.slice(0, 6).map((h) => (
                <RefLink key={`${h.kind}:${h.key}`} r={h} />
              ))}
            </div>
          ) : (
            <EmptyState>Les fiches que vous ouvrez apparaîtront ici.</EmptyState>
          )}
        </Section>

        <Section title={<span className="inline-flex items-center gap-2"><Star className="size-4" /> Favoris</span>}>
          {progress?.favorites.length ? (
            <div className="grid gap-1">
              {progress.favorites.slice(0, 6).map((f) => (
                <RefLink key={`${f.kind}:${f.key}`} r={f} />
              ))}
            </div>
          ) : (
            <EmptyState>Ajoutez des objets en favoris depuis leur fiche.</EmptyState>
          )}
        </Section>
      </div>

      {tip.data && (
        <Card className={cn('flex items-start gap-3 p-4')}>
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-q4" />
          <div>
            <div className="eyebrow mb-1">Astuce</div>
            <Markup text={tip.data.text} inline />
            <a href={tip.data.source} target="_blank" rel="noreferrer noopener" className="ml-2 text-xs text-faint underline">
              source
            </a>
          </div>
        </Card>
      )}
      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
