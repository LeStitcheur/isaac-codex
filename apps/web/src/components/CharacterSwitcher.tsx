/**
 * Changement rapide de personnage depuis une fiche : bande de portraits, précédent/suivant,
 * bascule normal ⇄ Tainted, flèches ← → (et T) au clavier. Les fiches voisines sont préchargées.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useMeta, useProgress } from '@/lib/queries';
import { cn, displayName } from '@/lib/utils';
import { Sprite } from './Sprite';

/** Requête d'une fiche personnage (partagée avec la page pour que le préchargement serve directement). */
export const characterQuery = <T,>(slug: string) => ({
  queryKey: ['character', slug],
  queryFn: () => api<T>(`/api/characters/${slug}`, { auth: false }),
  staleTime: 10 * 60_000,
});

export function CharacterSwitcher({ slug }: { slug: string }) {
  const meta = useMeta();
  const { data: progress } = useProgress();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const stripRef = useRef<HTMLDivElement>(null);

  const all = meta.data?.characters;
  const current = all?.find((c) => c.slug === slug);
  const group = useMemo(
    () => (all && current ? all.filter((c) => c.tainted === current.tainted).sort((a, b) => a.order - b.order) : []),
    [all, current],
  );
  const index = group.findIndex((c) => c.slug === slug);
  const prev = index >= 0 ? group[(index - 1 + group.length) % group.length] : undefined;
  const next = index >= 0 ? group[(index + 1) % group.length] : undefined;
  const counterpart =
    current && all ? (current.tainted ? all.find((c) => c.slug === current.baseSlug) : all.find((c) => c.tainted && c.baseSlug === current.slug)) : undefined;

  const prefetch = (s: string | undefined) => {
    if (s) void qc.prefetchQuery(characterQuery(s));
  };

  // Précharge les voisins et centre le portrait courant dans la bande.
  useEffect(() => {
    prefetch(prev?.slug);
    prefetch(next?.slug);
    prefetch(counterpart?.slug);
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, prev?.slug, next?.slug, counterpart?.slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft' && prev) navigate(`/personnages/${prev.slug}`);
      else if (e.key === 'ArrowRight' && next) navigate(`/personnages/${next.slug}`);
      else if ((e.key === 't' || e.key === 'T') && counterpart) navigate(`/personnages/${counterpart.slug}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, counterpart, navigate]);

  if (!current) return null;
  const marksTotal = meta.data?.completionMarks.length ?? 0;
  const arrow = 'grid size-9 shrink-0 place-items-center rounded-lg border border-line text-muted hover:border-[#3d4856] hover:text-ink';
  const toggleClass = current.tainted ? 'border-line text-parchment hover:border-[#3d4856]' : 'border-[#66313f] bg-[#391c27] text-[#ff839b] hover:border-[#ff5268]';

  return (
    <div className="rounded-xl border border-line bg-surface p-2" data-no-swipe data-testid="character-switcher">
      <div className="flex items-center gap-2">
        {prev && (
          <Link to={`/personnages/${prev.slug}`} onMouseEnter={() => prefetch(prev.slug)} className={arrow} aria-label={`Personnage précédent : ${displayName(prev)}`} title="Précédent (←)">
            <ChevronLeft className="size-5" />
          </Link>
        )}
        <div ref={stripRef} className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-1 [scrollbar-width:none]">
          {group.map((c) => {
            const done = Object.keys(progress?.marks[c.slug] ?? {}).length;
            const active = c.slug === slug;
            return (
              <Link
                key={c.slug}
                to={`/personnages/${c.slug}`}
                data-slug={c.slug}
                onMouseEnter={() => prefetch(c.slug)}
                onFocus={() => prefetch(c.slug)}
                title={`${displayName(c)} — ${done}/${marksTotal} marques`}
                aria-label={displayName(c)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative grid size-12 shrink-0 place-items-center rounded-lg border transition-colors',
                  active ? 'border-[#ff5268] bg-[#ff41571c]' : 'border-transparent hover:border-[#3d4856] hover:bg-surface-2',
                )}
              >
                <Sprite kind="character" id={c.slug} size={36} className="bg-transparent ring-0" />
                {marksTotal > 0 && done > 0 && (
                  <span className={cn('absolute bottom-0.5 right-0.5 size-1.5 rounded-full', done >= marksTotal ? 'bg-ok' : 'bg-[#ffb347]')} aria-hidden />
                )}
              </Link>
            );
          })}
        </div>
        {next && (
          <Link to={`/personnages/${next.slug}`} onMouseEnter={() => prefetch(next.slug)} className={arrow} aria-label={`Personnage suivant : ${displayName(next)}`} title="Suivant (→)">
            <ChevronRight className="size-5" />
          </Link>
        )}
        {counterpart && (
          <Link
            to={`/personnages/${counterpart.slug}`}
            onMouseEnter={() => prefetch(counterpart.slug)}
            className={cn('hidden h-9 shrink-0 items-center rounded-lg border px-3 text-xs font-semibold sm:flex', toggleClass)}
            title="Basculer normal / Tainted (T)"
          >
            {current.tainted ? 'Normal' : 'Tainted'}
          </Link>
        )}
      </div>
      {counterpart && (
        <Link to={`/personnages/${counterpart.slug}`} className={cn('mt-2 flex h-9 items-center justify-center rounded-lg border text-xs font-semibold sm:hidden', toggleClass)}>
          Voir {displayName(counterpart)}
        </Link>
      )}
    </div>
  );
}
