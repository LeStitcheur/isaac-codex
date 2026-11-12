/**
 * Balisage interne des textes de jeu (produit par scripts/data/lib/wikitext.ts) :
 *   ⟦i:Nom⟧ ou ⟦i:Nom¦Libellé⟧ → lien (i objet, t trinket, p consommable, c personnage, e boss/entité,
 *                                 s étage, a succès, pool pool d'objets)
 *   ⟨24⟩                        → marqueur de version (masque de bits) s'appliquant à la suite de la ligne
 * Les lignes commençant par *, ** ou # sont des listes.
 */
export type MarkupToken =
  | { type: 'text'; text: string }
  | { type: 'link'; kind: string; target: string; label: string }
  | { type: 'version'; mask: number };

const TOKEN_RE = /⟦([a-z]+):([^⟧¦]+)(?:¦([^⟧]*))?⟧|⟨(\d+)⟩/g;

export function tokenize(line: string): MarkupToken[] {
  const out: MarkupToken[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN_RE)) {
    if (m.index! > last) out.push({ type: 'text', text: line.slice(last, m.index) });
    if (m[4] !== undefined) out.push({ type: 'version', mask: Number(m[4]) });
    else out.push({ type: 'link', kind: m[1]!, target: m[2]!, label: m[3] || m[2]! });
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push({ type: 'text', text: line.slice(last) });
  return out;
}

/** Texte brut (recherche, résumés). */
export function markupToText(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/⟦[a-z]+:([^⟧¦]+)(?:¦([^⟧]*))?⟧/g, (_, t: string, l?: string) => l || t)
    .replace(/⟨\d+⟩\s?/g, '')
    .replace(/^[*#]+\s*/gm, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Garde uniquement les lignes applicables à une version donnée (bit), en respectant les marqueurs de début de ligne. */
export function filterMarkupByVersion(s: string, bit: number): string {
  return s
    .split('\n')
    .filter((line) => {
      const m = line.match(/^[*#]*\s*⟨(\d+)⟩/);
      return !m || (Number(m[1]) & bit) !== 0;
    })
    .join('\n');
}

export function slugify(name: string): string {
  const special: Record<string, string> = { '???': 'bluebaby', 'Tainted ???': 'tainted-bluebaby', '<3': 'less-than-three' };
  if (special[name]) return special[name]!;
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\?\?\?/g, 'bluebaby')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || `x-${[...name].map((c) => c.charCodeAt(0).toString(16)).join('')}`;
}
