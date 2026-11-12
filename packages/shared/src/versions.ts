/** Versions du jeu et masque de bits associé (identique au wiki : Template:Dlcset). */
export const VERSIONS = [
  { key: 'rebirth', bit: 1, label: 'Rebirth', short: 'R' },
  { key: 'afterbirth', bit: 2, label: 'Afterbirth', short: 'AB' },
  { key: 'afterbirthplus', bit: 4, label: 'Afterbirth+', short: 'AB+' },
  { key: 'repentance', bit: 8, label: 'Repentance', short: 'Rep' },
  { key: 'repentanceplus', bit: 16, label: 'Repentance+', short: 'Rep+' },
] as const;

export type VersionKey = (typeof VERSIONS)[number]['key'];
export const ALL_VERSIONS_MASK = 31;
export const REPENTANCE_BIT = 8;
export const REPENTANCE_PLUS_BIT = 16;

export function versionBit(key: VersionKey): number {
  return VERSIONS.find((v) => v.key === key)!.bit;
}

export function isInVersion(mask: number | null | undefined, key: VersionKey): boolean {
  if (mask == null) return true;
  return (mask & versionBit(key)) !== 0;
}

/** Libellé lisible d'un masque, ex. 24 → « Depuis Repentance », 7 → « Rebirth → Afterbirth+ ». */
export function maskLabel(mask: number): string {
  if (mask === ALL_VERSIONS_MASK) return 'Toutes versions';
  const bits = VERSIONS.filter((v) => mask & v.bit);
  if (bits.length === 0) return 'Aucune version';
  const first = bits[0]!;
  const last = bits[bits.length - 1]!;
  const contiguous = bits.length === VERSIONS.indexOf(last) - VERSIONS.indexOf(first) + 1;
  if (contiguous && last.bit === 16 && bits.length > 1) return `Depuis ${first.label}`;
  if (contiguous && bits.length > 2) return `${first.label} → ${last.label}`;
  return bits.map((b) => b.label).join(', ');
}

export function maskShort(mask: number): string {
  if (mask === ALL_VERSIONS_MASK) return 'Toutes';
  const bits = VERSIONS.filter((v) => mask & v.bit);
  const last = bits[bits.length - 1];
  if (bits.length > 1 && last?.bit === 16) return `dès ${bits[0]!.short}`;
  return bits.map((b) => b.short).join('/');
}

export const PLATFORMS = [
  { key: 'pc', label: 'PC (Steam)' },
  { key: 'switch', label: 'Nintendo Switch' },
  { key: 'playstation', label: 'PlayStation' },
  { key: 'xbox', label: 'Xbox' },
  { key: 'mobile', label: 'Mobile (iOS)' },
] as const;
export type PlatformKey = (typeof PLATFORMS)[number]['key'];
