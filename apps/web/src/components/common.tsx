import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, BookOpenCheck, ChevronLeft, ChevronRight, ExternalLink, Heart, Loader2, Star } from 'lucide-react';
import { maskLabel, maskShort, type EffectiveStatus, type EntityRef, type SourceRef } from '@isaac-codex/shared';
import { Badge, Button, Card, Select, Tip } from './ui';
import { Sprite } from './Sprite';
import { cn, entityHref } from '@/lib/utils';
import { usePatchProgress, useProgress } from '@/lib/queries';
import { ApiError } from '@/lib/api';
import { asset, GameIcon } from '@/lib/game-assets';

export function PageHeader({ title, subtitle, icon, actions, kicker }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode; kicker?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-col gap-4 animate-rise sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        {icon && <div className="mt-1 grid size-11 shrink-0 place-items-center rounded-xl bg-[#3c1c29] text-[#f97b91] [&_svg]:size-5">{icon}</div>}
        <div className="min-w-0">
          <div className="eyebrow mb-2">Isaac Codex{kicker ? <> / {kicker}</> : null}</div>
          <h1 className="text-[28px] text-parchment sm:text-[29px]">
            {title}
            {typeof title === 'string' && <span className="text-blood">.</span>}
          </h1>
          {subtitle && <div className="mt-2 max-w-3xl text-[13px] text-[#8593a3]">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, children, className, actions, id }: { title: ReactNode; children: ReactNode; className?: string; actions?: ReactNode; id?: string }) {
  return (
    <section id={id} className={cn('panel p-5 sm:p-6', className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-parchment">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export const QUALITY_COLORS = ['text-q0 ring-q0/40', 'text-q1 ring-q1/40', 'text-q2 ring-q2/40', 'text-q3 ring-q3/40', 'text-q4 ring-q4/40'];
export function QualityBadge({ quality, repPlus }: { quality: number | null | undefined; repPlus?: number | null }) {
  if (quality === null || quality === undefined) return <Badge variant="muted">Qualité ?</Badge>;
  const diff = repPlus !== undefined && repPlus !== null && repPlus !== quality;
  return (
    <Tip content={diff ? `Qualité ${quality} en Repentance, ${repPlus} en Repentance+` : `Qualité ${quality} (0 à 4)`}>
      <span className={cn('inline-flex items-center gap-1 rounded-md bg-[#141920] px-1.5 py-0.5 text-[11px] font-semibold ring-1', QUALITY_COLORS[quality])}>
        <GameIcon src={asset('quality', `q${quality}`)} size={11} />
        Q{quality}
        {diff && <span className="text-muted">→{repPlus}</span>}
      </span>
    </Tip>
  );
}

export function VersionBadge({ mask }: { mask: number }) {
  if (mask === 31) return null;
  return (
    <Tip content={maskLabel(mask)}>
      <span className="inline-flex cursor-help items-center rounded-md border border-[#374250] bg-[#252e39] px-1.5 py-0.5 text-[10px] font-semibold text-[#aab8c9]">{maskShort(mask)}</span>
    </Tip>
  );
}

export const STATUS_META: Record<EffectiveStatus, { label: string; variant: 'muted' | 'parchment' | 'warn' | 'ok' }> = {
  locked: { label: 'Verrouillé', variant: 'muted' },
  available: { label: 'Disponible', variant: 'parchment' },
  in_progress: { label: 'En cours', variant: 'warn' },
  unlocked: { label: 'Débloqué', variant: 'ok' },
};
export function StatusBadge({ status }: { status: EffectiveStatus | undefined }) {
  const m = STATUS_META[status ?? 'locked'];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

/** Sélecteur manuel de statut d'un succès (le statut automatique reste visible). */
export function StatusControl({ achievementId, status, compact }: { achievementId: number; status: EffectiveStatus | undefined; compact?: boolean }) {
  const { data: progress } = useProgress();
  const patch = usePatchProgress();
  const manual = progress?.unlocks[achievementId] ?? '';
  return (
    <div className="flex items-center gap-2">
      {!compact && <StatusBadge status={status} />}
      <Select
        aria-label="Statut manuel"
        value={manual}
        disabled={!progress}
        className="h-8 w-auto min-w-36 text-sm"
        onChange={(e) => patch.mutate({ unlocks: [{ achievementId, status: (e.target.value || null) as 'locked' | 'in_progress' | 'unlocked' | null }] })}
      >
        <option value="">Automatique{status && !manual ? ` (${STATUS_META[status].label.toLowerCase()})` : ''}</option>
        <option value="in_progress">En cours</option>
        <option value="unlocked">Débloqué</option>
        <option value="locked">Forcer « non débloqué »</option>
      </Select>
    </div>
  );
}

export function FavoriteButton({ refKind, refKey }: { refKind: EntityRef['kind']; refKey: string }) {
  const { data: progress } = useProgress();
  const patch = usePatchProgress();
  const fav = !!progress?.favorites.some((f) => f.kind === refKind && f.key === refKey);
  return (
    <Button
      variant={fav ? 'parchment' : 'outline'}
      size="sm"
      disabled={!progress}
      aria-pressed={fav}
      onClick={() => patch.mutate({ favorites: [{ kind: refKind, key: refKey, favorite: !fav }] })}
    >
      <Star className={cn(fav && 'fill-current')} /> {fav ? 'Favori' : 'Ajouter aux favoris'}
    </Button>
  );
}

export function EntityChip({ kind, id, name, quality, className }: { kind: 'item' | 'trinket' | 'consumable' | 'character' | 'boss' | 'floor'; id: string; name: string; quality?: number | null; className?: string }) {
  return (
    <Link to={entityHref(kind, id)} className={cn('inline-flex items-center gap-2 rounded-lg border border-line bg-[#141920] py-1 pl-1 pr-2.5 text-[13px] hover:border-[#46576a] hover:bg-surface-2', className)}>
      <Sprite kind={kind} id={id} quality={quality} size={24} />
      <span className="truncate">{name}</span>
    </Link>
  );
}

export function SourceNote({ source, label = 'Source' }: { source: SourceRef; label?: string }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[11px] text-faint">
      <BookOpenCheck className="size-3.5" />
      <span>
        {label} : {source.page ? (
          <a href={source.page} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-muted underline-offset-2 hover:underline">
            {decodeURIComponent(source.page.split('/wiki/')[1] ?? source.page).replace(/_/g, ' ')} <ExternalLink className="size-3" />
          </a>
        ) : source.source}
      </span>
      {source.revid && <span>révision {source.revid}</span>}
      <span>vérifié le {new Date(source.verifiedAt).toLocaleDateString('fr-FR')}</span>
      <span>confiance : {source.confidence === 'high' ? 'élevée' : source.confidence === 'medium' ? 'moyenne' : source.confidence === 'editorial' ? 'éditoriale' : 'faible'}</span>
      <span>texte sous licence CC BY-SA 4.0</span>
    </div>
  );
}

export function Hearts({ health }: { health: Record<string, number> }) {
  const colors: Record<string, string> = { red: 'text-blood', soul: 'text-q3', black: 'text-abyss stroke-ink', bone: 'text-q1', coin: 'text-q4', rotten: 'text-q2', eternal: 'text-ink', golden: 'text-q4' };
  const names: Record<string, string> = { red: 'rouge', soul: "d'âme", black: 'noir', bone: "d'os", coin: 'pièce', rotten: 'pourri', eternal: 'éternel', golden: 'doré' };
  const entries = Object.entries(health).filter(([, n]) => n > 0);
  if (!entries.length) return <span className="text-muted">Aucun cœur</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {entries.map(([k, n]) => (
        <Tip key={k} content={`${n} cœur${n > 1 ? 's' : ''} ${names[k] ?? k}`}>
          <span className="inline-flex items-center gap-0.5">
            {Array.from({ length: Math.ceil(n) }).map((_, i) => {
              const half = i === Math.ceil(n) - 1 && n % 1 !== 0;
              const img = asset('hearts', half ? `${k}-half` : k) ?? asset('hearts', k);
              return img ? (
                <GameIcon key={i} src={img} size={18} />
              ) : (
                <Heart key={i} className={cn('size-4 fill-current', colors[k] ?? 'text-muted')} strokeWidth={k === 'black' ? 1.5 : 0} />
              );
            })}
          </span>
        </Tip>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Page précédente">
        <ChevronLeft />
      </Button>
      <span className="text-xs font-medium tabular-nums text-muted">
        {page} / {pages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Page suivante">
        <ChevronRight />
      </Button>
    </nav>
  );
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted" role="status">
      <Loader2 className="size-5 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const msg = error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Erreur inconnue';
  return (
    <Card className="mx-auto my-10 max-w-lg p-6 text-center">
      <AlertTriangle className="mx-auto mb-2 size-8 text-blood" />
      <p className="text-lg font-semibold text-parchment">{error instanceof ApiError && error.status === 404 ? 'Introuvable' : 'Une erreur est survenue'}</p>
      <p className="mt-1 text-muted">{msg}</p>
    </Card>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-8 text-center text-[13px] text-muted">{children}</div>;
}

export function StatTile({ label, value, sub, tone = 'parchment' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'parchment' | 'blood' }) {
  return (
    <div className="rounded-[10px] border border-line bg-gradient-to-br from-[#161c23] to-[#12171d] p-4">
      <div className="eyebrow">{label}</div>
      <div className={cn('mt-2 text-2xl font-semibold leading-none tracking-tight', tone === 'blood' ? 'text-blood-bright' : 'text-parchment')}>{value}</div>
      {sub && <div className="mt-2 text-[11px] text-faint">{sub}</div>}
    </div>
  );
}
