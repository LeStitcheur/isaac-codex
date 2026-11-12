/**
 * Sprite d'une entité : image fournie dans data/sprites/<groupe>/<clé>.png, sinon sprite du jeu intégré
 * (scripts/assets/extract-mod-assets.ts), sinon emblème pixel-art généré (motif symétrique déterministe
 * coloré selon la qualité ou le type).
 */
import { memo, useState } from 'react';
import { useSpriteManifest } from '@/lib/queries';
import { asset } from '@/lib/game-assets';
import { cn } from '@/lib/utils';

const PALETTES: Record<string, [string, string, string]> = {
  q0: ['#4a4246', '#8a8085', '#c4bcc0'],
  q1: ['#6e5c45', '#c9b8a0', '#f0e7dc'],
  q2: ['#2f5a33', '#6fae6b', '#c8e6b5'],
  q3: ['#2d4a7a', '#5f8fd6', '#cfe0ff'],
  q4: ['#7a4d10', '#e0a63a', '#fff0b8'],
  trinket: ['#5a3a1a', '#b98a4a', '#f2d9a8'],
  consumable: ['#4a2448', '#9c5aa0', '#f0c8f5'],
  character: ['#5a1f26', '#b73b43', '#f0e7dc'],
  boss: ['#3a0f14', '#7a2530', '#d4515a'],
  floor: ['#22303a', '#56707f', '#c5d7e0'],
  none: ['#3d313d', '#6f6466', '#a89b9d'],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pattern(seed: string): number[][] {
  let h = hash(seed);
  const rnd = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  const size = 8;
  const grid: number[][] = [];
  for (let y = 0; y < size; y++) {
    const row: number[] = [];
    for (let x = 0; x < size / 2; x++) {
      const dist = Math.abs(x - 3.5) + Math.abs(y - 3.5);
      const p = rnd();
      row.push(dist > 5.5 ? 0 : p < 0.45 ? 0 : p < 0.78 ? 2 : p < 0.93 ? 1 : 3);
    }
    grid.push([...row, ...[...row].reverse()]);
  }
  return grid;
}

const GROUP: Record<string, string> = { item: 'items', trinket: 'trinkets', consumable: 'consumables', character: 'characters', boss: 'bosses' };

export const Sprite = memo(function Sprite({
  kind,
  id,
  quality,
  size = 48,
  className,
  title,
  src,
}: {
  kind: 'item' | 'trinket' | 'consumable' | 'character' | 'boss' | 'floor';
  id: string | number;
  quality?: number | null;
  size?: number;
  className?: string;
  title?: string;
  /** Image explicite (ex. face de carte) ; prioritaire sur l'emblème généré. */
  src?: string;
}) {
  const manifest = useSpriteManifest();
  const [failed, setFailed] = useState(false);
  const group = GROUP[kind];
  const file = group ? ['png', 'webp', 'gif'].map((ext) => `${id}.${ext}`).find((f) => manifest.data?.[group]?.has(f)) : undefined;
  // Ordre : sprite fourni dans data/sprites → image du jeu intégrée (portraits, objets, boss, cartes) → emblème généré.
  const builtIn = src ?? (kind === 'character' ? asset('portraits', id) ?? asset('characters', id) : group ? asset(group, id) : undefined);
  if ((file || builtIn) && !failed) {
    return (
      <img
        src={file ? `/sprites/${group}/${file}` : builtIn}
        alt={title ?? ''}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('shrink-0 object-contain [image-rendering:pixelated]', className)}
      />
    );
  }
  const paletteKey = kind === 'item' ? (quality === null || quality === undefined ? 'none' : `q${quality}`) : kind;
  const [dark, mid, light] = PALETTES[paletteKey] ?? PALETTES.none!;
  const grid = pattern(`${kind}:${id}`);
  return (
    <svg
      viewBox="-1 -1 10 10"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title ?? ''}
      className={cn('shrink-0 rounded-md bg-abyss/70 ring-1 ring-parchment/10', className)}
    >
      {grid.flatMap((row, y) =>
        row.map((v, x) => (v ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={v === 1 ? dark : v === 2 ? mid : light} /> : null)),
      )}
    </svg>
  );
});
