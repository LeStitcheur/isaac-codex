import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { EntityRef } from '@isaac-codex/shared';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Nom affiché : français si disponible, sinon anglais. */
export function displayName(e: { nameFr?: string | null; nameEn?: string; name?: string } | null | undefined): string {
  if (!e) return '';
  return e.nameFr || e.nameEn || e.name || '';
}

export function entityHref(kind: string, key: string): string {
  switch (kind) {
    case 'i':
    case 'item':
      return `/objets/${key}`;
    case 't':
    case 'trinket':
      return `/trinkets/${key}`;
    case 'p':
    case 'consumable':
      return `/consommables/${key}`;
    case 'c':
    case 'character':
      return `/personnages/${key}`;
    case 'e':
    case 'boss':
      return `/boss/${key}`;
    case 's':
    case 'floor':
      return `/etages/${key}`;
    case 'a':
    case 'achievement':
      return `/succes/${key}`;
    case 'guide':
      return `/guides/${key}`;
    case 'transformation':
      return `/synergies?transformation=${encodeURIComponent(key)}`;
    case 'pool':
      return `/objets?pool=${encodeURIComponent(key)}`;
    default:
      return '/';
  }
}

export const refId = (r: EntityRef) => `${r.kind}:${r.key}`;

export const KIND_LABEL: Record<string, string> = {
  item: 'Objet',
  trinket: 'Trinket',
  consumable: 'Consommable',
  character: 'Personnage',
  boss: 'Boss',
  floor: 'Étage',
  achievement: 'Succès',
  guide: 'Guide',
  transformation: 'Transformation',
};

export const CONSUMABLE_KIND_FR: Record<string, string> = {
  card: 'Carte',
  'special card': 'Carte spéciale',
  rune: 'Rune',
  'soul stone': "Pierre d'âme",
  pill: 'Pilule',
  other: 'Autre consommable',
};

export const REWARD_KIND_FR: Record<string, string> = {
  item: 'Objet',
  trinket: 'Trinket',
  consumable: 'Consommable',
  character: 'Personnage',
  floor: 'Étage / zone',
  baby: 'Bébé coopératif',
  challenge: 'Défi',
  other: 'Autre',
};

export const ACH_KIND_FR: Record<string, string> = {
  mark: 'Marque de complétion',
  allMarks: 'Toutes les marques',
  donation: 'Donation Machine',
  greedDonation: 'Greed Donation Machine',
  challenge: 'Défi',
  other: 'Autre',
};

export function formatPct(n: number) {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
