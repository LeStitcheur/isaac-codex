/**
 * Images du jeu découpées depuis les mods « Better Character Menu » et « External Item Descriptions »
 * (voir scripts/assets/extract-mod-assets.ts). Le manifeste est généré ; une clé absente renvoie undefined.
 */
import manifest from '@/generated/game-assets.json';

type Group = keyof typeof manifest;
const m = manifest as Record<string, Record<string, string> | undefined>;

export function asset(group: Group | string, key: string | number | null | undefined): string | undefined {
  if (key === null || key === undefined) return undefined;
  return m[group]?.[String(key)];
}

/** Icône de salle correspondant à un pool d'objets. */
const POOL_ROOM: Record<string, [string, string]> = {
  'Treasure Room': ['rooms', 'treasure'], 'Greed Treasure Room': ['rooms', 'treasure'],
  Shop: ['rooms', 'shop'], 'Greed Shop': ['rooms', 'shop'], 'Baby Shop': ['rooms', 'shop'],
  Boss: ['rooms', 'boss'], 'Greed Boss': ['rooms', 'boss'],
  'Devil Room': ['rooms', 'devil'], 'Greed Devil Room': ['rooms', 'devil'],
  'Angel Room': ['rooms', 'angel'], 'Greed Angel Room': ['rooms', 'angel'],
  'Secret Room': ['rooms', 'secret'], 'Greed Secret Room': ['rooms', 'secret'],
  'Ultra Secret Room': ['rooms', 'ultra-secret'], Library: ['rooms', 'library'], 'Greed Library': ['rooms', 'library'],
  'Curse Room': ['rooms', 'curse'], 'Greed Curse Room': ['rooms', 'curse'], Planetarium: ['rooms', 'planetarium'],
  'Golden Chest': ['rooms', 'golden-chest'], 'Greed Golden Chest': ['rooms', 'golden-chest'], 'Red Chest': ['rooms', 'red-chest'],
  'Wooden Chest': ['rooms', 'wooden-chest'], 'Old Chest': ['rooms', 'chest'], "Mom's Chest": ['rooms', 'bedroom'],
  'Crane Game': ['machines', 'crane-game'], 'Shell Game': ['rooms', 'arcade'],
  Beggar: ['beggars', 'beggar'], 'Devil Beggar': ['beggars', 'devil-beggar'], 'Battery Bum': ['beggars', 'battery-bum'],
  'Key Master': ['beggars', 'key-master'], 'Bomb Bum': ['beggars', 'bomb-bum'], 'Rotten Beggar': ['beggars', 'rotten-beggar'],
};
export const poolIcon = (pool: string) => (POOL_ROOM[pool] ? asset(POOL_ROOM[pool][0], POOL_ROOM[pool][1]) : undefined);

/** Image d'un consommable : face de carte/rune selon son identifiant, sinon icône générique. */
export function consumableIcon(c: { kind: string; gameId: number | null }) {
  if (c.kind === 'pill') return asset('pickups', 'pill');
  return asset('cards', c.gameId) ?? asset('pickups', c.kind === 'rune' || c.kind === 'soul stone' ? 'rune' : 'card');
}

/**
 * Marque de complétion du jeu sur une pastille couleur papier (les icônes sont dessinées à l'encre sombre).
 * Non obtenue : icône normale estompée ; normal / difficile : icône correspondante.
 */
export function MarkIcon({ markKey, state, size = 16, title, className = '' }: { markKey: string; state?: 'normal' | 'hard' | 'none'; size?: number; title?: string; className?: string }) {
  const src = asset('marks', state === 'hard' ? `${markKey}-hard` : markKey);
  if (!src) return null;
  return (
    <span
      title={title}
      className={`inline-grid shrink-0 place-items-center rounded-md bg-[#ddd3cf] shadow-[inset_0_-1px_0_rgb(0_0_0/0.18)] ${state === 'none' ? 'opacity-35' : ''} ${state === 'hard' ? 'ring-1 ring-blood/70' : ''} ${className}`}
      style={{ width: size + 8, height: size + 8 }}
    >
      <img src={src} alt={title ?? ''} width={size} height={size} className="[image-rendering:pixelated]" loading="lazy" />
    </span>
  );
}

export function GameIcon({ src, alt = '', size = 18, className = '' }: { src: string | undefined; alt?: string; size?: number; className?: string }) {
  if (!src) return null;
  return <img src={src} alt={alt} title={alt || undefined} height={size} style={{ height: size, width: 'auto' }} className={`inline-block shrink-0 [image-rendering:pixelated] ${className}`} loading="lazy" />;
}
