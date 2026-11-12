/**
 * Simulateur de build : analyse un ensemble d'objets possédés pendant une partie.
 * - synergies et interactions DOCUMENTÉES entre les objets choisis (aucune n'est inventée) ;
 * - progression des transformations ;
 * - cumul indicatif des modificateurs de statistiques simples décrits par les objets
 *   (ne simule PAS le moteur : plafonds, formules de cadence, effets conditionnels ignorés) ;
 * - objets qui compléteraient des combinaisons documentées.
 */
import type { EntityRef, Item, Synergy, Transformation, Trinket } from './game-schema.js';
import { filterMarkupByVersion, markupToText } from './markup.js';

export type StatKey = 'damage' | 'tears' | 'speed' | 'range' | 'shotSpeed' | 'luck';
export interface StatMod {
  stat: StatKey;
  op: 'add' | 'mul';
  value: number;
}

const STAT_NAMES: Record<string, StatKey> = {
  damage: 'damage', tears: 'tears', 'fire rate': 'tears', speed: 'speed', range: 'range', 'shot speed': 'shotSpeed', luck: 'luck',
};
const CONDITIONAL = /\b(for the current room|for the room|while|when|whenever|for \d+ seconds|temporar|upon|if |each time|per |every |chance|until|after)\b/i;

/** Extrait les modificateurs simples et inconditionnels d'une description (version filtrée). */
export function parseStatMods(description: string, versionBit: number): StatMod[] {
  const text = markupToText(filterMarkupByVersion(description, versionBit));
  const mods: StatMod[] = [];
  for (const sentence of text.split(/(?<=\.)\s+|\n|,(?=\s*[+\-−x×]\s?\d)/)) {
    if (CONDITIONAL.test(sentence)) continue;
    for (const m of sentence.matchAll(/([+\-−])\s?(\d+(?:\.\d+)?)\s*(damage|tears|fire rate|shot speed|speed|range|luck)\b(?!\s*multiplier)/gi)) {
      const sign = m[1] === '+' ? 1 : -1;
      mods.push({ stat: STAT_NAMES[m[3]!.toLowerCase()]!, op: 'add', value: sign * Number(m[2]) });
    }
    for (const m of sentence.matchAll(/[x×]\s?(\d+(?:\.\d+)?)\s*(damage|tears|fire rate|shot speed|speed|range|luck)(?:\s*multiplier)?/gi)) {
      mods.push({ stat: STAT_NAMES[m[2]!.toLowerCase()]!, op: 'mul', value: Number(m[1]) });
    }
  }
  return mods;
}

export interface BuildContext {
  items: Item[];
  trinkets: Trinket[];
  synergies: Synergy[];
  transformations: Transformation[];
}

const refKey = (r: EntityRef) => `${r.kind}:${r.key}`;

export interface BuildAnalysis {
  synergies: Synergy[];
  interactions: Synergy[];
  transformations: { slug: string; name: string; have: EntityRef[]; missing: EntityRef[]; count: number; complete: boolean }[];
  stats: {
    additive: Record<StatKey, number>;
    multipliers: Record<StatKey, number>;
    contributions: { ref: EntityRef; mods: StatMod[] }[];
  };
  suggestions: { ref: EntityRef; score: number; reasons: string[] }[];
}

export function analyzeBuild(selected: EntityRef[], ctx: BuildContext, versionBit: number): BuildAnalysis {
  const sel = new Set(selected.map(refKey));
  const pairs = ctx.synergies.filter(
    (s) => sel.has(refKey(s.a)) && sel.has(refKey(s.b)) && (s.mask === null || (s.mask & versionBit) !== 0),
  );

  const transformations = ctx.transformations
    .filter((t) => t.mask & versionBit)
    .map((t) => {
      const have = t.members.filter((m) => sel.has(refKey(m)));
      return {
        slug: t.slug,
        name: t.nameFr ?? t.nameEn,
        have,
        missing: t.members.filter((m) => !sel.has(refKey(m))),
        count: have.length,
        complete: have.length >= 3,
      };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

  const zero = (): Record<StatKey, number> => ({ damage: 0, tears: 0, speed: 0, range: 0, shotSpeed: 0, luck: 0 });
  const additive = zero();
  const multipliers: Record<StatKey, number> = { damage: 1, tears: 1, speed: 1, range: 1, shotSpeed: 1, luck: 1 };
  const contributions: BuildAnalysis['stats']['contributions'] = [];
  for (const ref of selected) {
    const entity = ref.kind === 'item' ? ctx.items.find((i) => String(i.id) === ref.key) : ref.kind === 'trinket' ? ctx.trinkets.find((t) => String(t.id) === ref.key) : undefined;
    if (!entity) continue;
    const mods = parseStatMods(entity.description, versionBit);
    if (!mods.length) continue;
    contributions.push({ ref, mods });
    for (const m of mods) {
      if (m.op === 'add') additive[m.stat] = Math.round((additive[m.stat] + m.value) * 1000) / 1000;
      else multipliers[m.stat] = Math.round(multipliers[m.stat] * m.value * 1000) / 1000;
    }
  }

  // Suggestions : objets ayant des synergies documentées avec plusieurs objets choisis, ou complétant une transformation.
  const scores = new Map<string, { ref: EntityRef; score: number; reasons: string[] }>();
  const bump = (ref: EntityRef, score: number, reason: string) => {
    if (sel.has(refKey(ref)) || (ref.kind !== 'item' && ref.kind !== 'trinket')) return;
    const k = refKey(ref);
    const cur = scores.get(k) ?? { ref, score: 0, reasons: [] };
    cur.score += score;
    if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
    scores.set(k, cur);
  };
  for (const s of ctx.synergies) {
    if (s.section !== 'synergy' || (s.mask !== null && !(s.mask & versionBit))) continue;
    if (sel.has(refKey(s.a))) bump(s.b, 2, `Synergie documentée avec ${s.a.kind === 'item' ? 'un objet choisi' : 'un trinket choisi'}`);
    if (sel.has(refKey(s.b))) bump(s.a, 2, `Synergie documentée avec ${s.b.kind === 'item' ? 'un objet choisi' : 'un trinket choisi'}`);
  }
  for (const t of transformations) {
    if (t.complete) continue;
    for (const m of t.missing) bump(m, 3 + t.count * 2, `Compléterait la transformation ${t.name} (${t.count}/3)`);
  }
  const suggestions = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 15);

  return {
    synergies: pairs.filter((p) => p.section === 'synergy'),
    interactions: pairs.filter((p) => p.section === 'interaction'),
    transformations,
    stats: { additive, multipliers, contributions },
    suggestions,
  };
}
