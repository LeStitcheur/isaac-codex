/**
 * Construit le jeu de données normalisé d'Isaac Codex à partir :
 *  - des réponses brutes de l'API du wiki (packages/game-data/raw, CC BY-SA 4.0),
 *  - des contenus éditoriaux rédigés en français (packages/game-data/curated).
 *
 * Sortie : packages/game-data/generated/dataset.json (validé par Zod) + docs/COUVERTURE-DONNEES.md.
 * Aucune donnée n'est inventée : un champ introuvable reste `null` et apparaît dans le rapport de couverture.
 *
 * Usage : npm run data:build
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { wikiToMarkup, infoboxParam } from './lib/wikitext.js';
import { markupToText, slugify, tokenize } from '../../packages/shared/src/markup.js';
import {
  dataset as datasetSchema,
  type Achievement, type Boss, type Challenge, type Character, type CompletionMark, type Consumable, type Dataset,
  type DonationMilestone, type EntityRef, type Floor, type Guide, type Item, type MarkKey, type MarkUnlock,
  type PlannerPath, type Pool, type Route, type SourceRef, type Synergy, type Transformation, type Trinket,
} from '../../packages/shared/src/game-schema.js';

const RAW = path.resolve('packages/game-data/raw');
const CURATED = path.resolve('packages/game-data/curated');
const OUT = path.resolve('packages/game-data/generated');
const WIKI = 'The Binding of Isaac: Rebirth Wiki (wiki.gg) — CC BY-SA 4.0';

type Row = Record<string, string>;
type PageExtract = { revid: number; timestamp: string; infobox: string; sections: Record<string, string>; fr: string | null };

const raw = <T,>(name: string): T => JSON.parse(readFileSync(path.join(RAW, `${name}.json`), 'utf8')) as T;
const curated = <T,>(name: string, fallback: T): T => {
  const f = path.join(CURATED, `${name}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : fallback;
};
const cargo = (t: string) => raw<Row[]>(`cargo-${t}`);
const manifest = raw<{ fetchedAt: string; url: string; license: string; licenseUrl: string; source: string; method: string }>('manifest');
const verifiedAt = manifest.fetchedAt;
const warnings: string[] = [];

const src = (page: string | null, revid: number | null = null, confidence: SourceRef['confidence'] = 'high'): SourceRef => ({
  source: WIKI,
  page: page ? `${manifest.url}wiki/${encodeURIComponent(page.replace(/ /g, '_'))}` : null,
  revid,
  verifiedAt,
  confidence,
});

const num = (v: string | undefined | null) => (v === undefined || v === null || v === '' ? null : Number(v));
const mask = (r: Row) => Number(r.dlc ?? 31) || 0;
const REP = 8;
const REPP = 16;

/** Valeur applicable à une version (bit) parmi des lignes Cargo versionnées. */
function pick<T extends Row>(rows: T[], bit: number): T | undefined {
  return rows.find((r) => mask(r) & bit) ?? undefined;
}
function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}
const orMask = (rows: Row[]) => rows.reduce((acc, r) => acc | mask(r), 0);

/** Slug unique dans un espace donné (cartes inversées « ? » → suffixe -reversed). */
function uniqueSlug(name: string, used: Set<string>): string {
  const base = slugify(name);
  let slug = base;
  if (used.has(slug) && name.trim().endsWith('?')) slug = `${base}-reversed`;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}

/* ------------------------------------------------------------------ */
/* Chargement                                                          */
/* ------------------------------------------------------------------ */
const collectibleRows = cargo('collectible');
const trinketRows = cargo('trinket');
const pickupRows = cargo('pickup');
const playerRows = cargo('player');
const achievementRows = cargo('achievement');
const bossRows = cargo('entity-bosses');
const stageRows = cargo('stage');
const challengeRows = cargo('challenge');

const itemPages = raw<Record<string, PageExtract>>('pages-collectibles');
const trinketPages = raw<Record<string, PageExtract>>('pages-trinkets');
const pickupPages = raw<Record<string, PageExtract>>('pages-pickups');
const characterPages = raw<Record<string, PageExtract>>('pages-characters');
const bossPages = raw<Record<string, PageExtract>>('pages-bosses');
const reference = raw<Record<string, { revid: number; content: string }>>('full-reference');

/* ------------------------------------------------------------------ */
/* Index des noms → clés canoniques                                    */
/* ------------------------------------------------------------------ */
// Un même identifiant peut avoir été réutilisé entre versions (ex. 474 : Tonsil en AB+, Broken Glass Cannon en Repentance).
// L'objet présent dans la version de référence (Repentance) est conservé ; l'autre est signalé dans le rapport.
const itemPageMask = new Map<string, number>();
for (const r of collectibleRows) itemPageMask.set(r._pageName!, (itemPageMask.get(r._pageName!) ?? 0) | mask(r));
const keptPageForId = new Map<string, string>();
for (const r of collectibleRows) {
  const cur = keptPageForId.get(r.id!);
  if (!cur || (!(itemPageMask.get(cur)! & REP) && itemPageMask.get(r._pageName!)! & REP)) keptPageForId.set(r.id!, r._pageName!);
}
const keptItemRows = collectibleRows.filter((r) => keptPageForId.get(r.id!) === r._pageName);

const itemByName = new Map<string, number>();
for (const r of keptItemRows) {
  for (const n of [r.alias, r._pageName]) if (n) itemByName.set(n.toLowerCase(), Number(r.id));
}
for (const r of cargo('collectible_name')) if (r.name && itemByName.has(r.collectible!.toLowerCase())) itemByName.set(r.name.toLowerCase(), itemByName.get(r.collectible!.toLowerCase())!);

const trinketByName = new Map<string, number>();
for (const r of trinketRows) for (const n of [r.alias, r._pageName]) if (n) trinketByName.set(n.toLowerCase(), Number(r.id));
for (const r of cargo('trinket_name')) if (r.name && trinketByName.has(r.trinket!.toLowerCase())) trinketByName.set(r.name.toLowerCase(), trinketByName.get(r.trinket!.toLowerCase())!);

const consumableByName = new Map<string, string>(); // nom → slug
const mainPlayers = playerRows.filter((r) => !r.parent);
const characterByName = new Map<string, string>();
for (const r of mainPlayers) {
  const slug = slugify(r.alias!);
  for (const n of [r.alias, r._pageName, r._pageName!.replace(/ \(Character\)$/, '')]) if (n) characterByName.set(n.toLowerCase(), slug);
}
for (const r of playerRows.filter((r) => r.parent)) {
  characterByName.set(r.alias!.toLowerCase(), slugify(r.parent!));
}
characterByName.set('jacob and esau', 'jacob');
characterByName.set('jacob & esau', 'jacob');
characterByName.set('blue baby', 'bluebaby');

const bossByName = new Map<string, string>();
for (const r of bossRows) {
  const slug = slugify(r.alias!);
  for (const n of [r.alias, r._pageName]) if (n && !bossByName.has(n.toLowerCase())) bossByName.set(n.toLowerCase(), slug);
}
const floorByName = new Map<string, string>();
const floorSlug = (page: string) => {
  const base = page.replace(/ \(Floor\)$/, '');
  return base === '???' ? 'blue-womb' : slugify(base);
};
for (const r of stageRows) {
  for (const n of [r.alias, r._pageName, r._pageName!.replace(/ \(Floor\)$/, '')]) if (n) floorByName.set(n.toLowerCase(), floorSlug(r._pageName!));
}
floorByName.set('the chest', 'chest');
floorByName.set('the cathedral', 'cathedral');
floorByName.set('the womb', 'womb');
floorByName.set('blue womb', 'blue-womb');
const achievementByName = new Map<string, number>();
for (const r of achievementRows) {
  for (const n of [r.alias, r.name]) if (n && !achievementByName.has(n.toLowerCase())) achievementByName.set(n.toLowerCase(), Number(r.id));
}
const poolKeys = new Map<string, string>();
for (const r of cargo('pool')) poolKeys.set(r.alias!.toLowerCase(), r.alias!);

const pageKinds = new Map<string, string>();
for (const p of Object.keys(itemPages)) pageKinds.set(p, 'i');
for (const p of Object.keys(trinketPages)) pageKinds.set(p, 't');
for (const p of Object.keys(pickupPages)) pageKinds.set(p, 'p');
for (const r of playerRows) pageKinds.set(r._pageName!, 'c');
for (const r of bossRows) pageKinds.set(r._pageName!, 'e');
for (const r of stageRows) pageKinds.set(r._pageName!, 's');
const resolvePage = (page: string) => pageKinds.get(page) ?? null;

let unresolvedLinks = 0;

/** Remplace les cibles des liens par des clés canoniques ; les liens introuvables deviennent du texte. */
function canonical(markup: string): string {
  return markup.replace(/⟦([a-z]+):([^⟧¦]+)(?:¦([^⟧]*))?⟧/g, (_whole, kind: string, target: string, label?: string) => {
    const name = target.trim();
    const lower = name.toLowerCase();
    const shown = label || name;
    let key: string | null = null;
    let k = kind;
    switch (kind) {
      case 'i': key = itemByName.has(lower) ? String(itemByName.get(lower)) : null; break;
      case 't': key = trinketByName.has(lower) ? String(trinketByName.get(lower)) : null; break;
      case 'p': key = consumableByName.get(lower) ?? null; break;
      case 'c': key = characterByName.get(lower) ?? null; break;
      case 'e': key = bossByName.get(lower) ?? null; break;
      case 's': key = floorByName.get(lower) ?? null; break;
      case 'a': key = achievementByName.has(lower) ? String(achievementByName.get(lower)) : null; break;
      case 'pool': key = poolKeys.get(lower) ?? poolKeys.get(lower.replace(/ \(item pool\)$/, '')) ?? null; break;
      default: key = null;
    }
    // Un lien {{e|...}} ou {{i|...}} vers un autre type d'entité est fréquent sur le wiki.
    if (!key && kind === 'e' && itemByName.has(lower)) { key = String(itemByName.get(lower)); k = 'i'; }
    if (!key && (kind === 'i' || kind === 'e') && trinketByName.has(lower)) { key = String(trinketByName.get(lower)); k = 't'; }
    if (!key && (kind === 'i' || kind === 'e' || kind === 't') && consumableByName.has(lower)) { key = consumableByName.get(lower)!; k = 'p'; }
    if (!key && kind === 'e' && characterByName.has(lower)) { key = characterByName.get(lower)!; k = 'c'; }
    if (!key) {
      if (!['e', 's', 'pool'].includes(kind)) unresolvedLinks++;
      return shown;
    }
    return `⟦${k}:${key}¦${shown}⟧`;
  });
}
const md = (s: string | null | undefined) => (s ? canonical(wikiToMarkup(s, resolvePage)) || null : null);

function section(page: PageExtract | undefined, ...names: string[]): string | null {
  if (!page) return null;
  for (const n of names) {
    const key = Object.keys(page.sections).find((k) => k.toLowerCase() === n.toLowerCase());
    if (key) return md(page.sections[key]);
  }
  return null;
}
function pageFr(p: PageExtract | undefined): string | null {
  return p?.fr ? p.fr.replace(/\s*\((?:objet|trinket|carte|personnage|boss)\)\s*$/i, '').trim() || null : null;
}
const achievementName = (n: string | undefined | null) => (n ? achievementByName.get(n.toLowerCase()) ?? null : null);

/* ------------------------------------------------------------------ */
/* Consommables (cartes, runes, pierres d'âme, pilules)                */
/* ------------------------------------------------------------------ */
const pickupNames = groupBy(cargo('pickup_name'), (r) => r.pickup!);
const pickupQuotes = groupBy(cargo('pickup_quote'), (r) => r.pickup!);
type ConsumableDraft = Consumable & { _page?: string; _unlock?: string };
const consumables: ConsumableDraft[] = [];
const consumableSlugs = new Set<string>();
for (const [page, rows] of groupBy(pickupRows, (r) => r._pageName!)) {
  const ref = pick(rows, REP) ?? rows[rows.length - 1]!;
  const alias = ref.alias!;
  const nameRow = pick(pickupNames.get(alias) ?? [], REP);
  const quoteRow = pick(pickupQuotes.get(alias) ?? [], REP);
  const type = (ref.type || 'other') as Consumable['kind'];
  const slug = uniqueSlug(nameRow?.name ?? alias, consumableSlugs);
  consumableByName.set(alias.toLowerCase(), slug);
  consumableByName.set(page.toLowerCase(), slug);
  if (nameRow?.name) consumableByName.set(nameRow.name.toLowerCase(), slug);
  consumables.push({
    slug,
    gameId: num(ref.id),
    kind: ['card', 'special card', 'rune', 'soul stone'].includes(type) ? type : 'other',
    nameEn: nameRow?.name ?? alias,
    nameFr: pageFr(pickupPages[page]),
    quote: quoteRow?.quote ? wikiToMarkup(quoteRow.quote) : null,
    description: ref.description ?? '',
    horseEffect: null,
    polarity: null,
    unlockAchievementId: null,
    mask: orMask(rows),
    effects: null,
    notes: null,
    source: src(page, pickupPages[page]?.revid ?? null),
    _page: page,
    _unlock: ref.unlocked_by,
  });
}

// Pilules : tableau de la page « Pills ».
{
  const pills = reference['Pills']!;
  const content = pills.content;
  const start = content.indexOf('== Pill Effects ==');
  const table = content.slice(start, content.indexOf('\n|}', start));
  const rowsText = table.split(/\n\|-\s*id="[^"]*"\s*\n/).slice(1);
  for (const rowText of rowsText) {
    // Les liens [[a|b]] contiennent des « | » : on les simplifie avant de découper les cellules.
    const simplified = rowText.replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, '[[$1¦$2]]');
    const cells = simplified.replace(/^\|/, '').split(/\n\||\|\|/).map((c) => c.trim().replace(/¦/g, '|'));
    if (cells.length < 5) continue;
    const id = Number(cells[0]);
    const name = wikiToMarkup(cells[1]!).trim();
    const polRaw = cells[2]!.split('|').pop()!.trim();
    if (!name || Number.isNaN(id)) continue;
    const slug = uniqueSlug(`pill ${name}`, consumableSlugs);
    consumableByName.set(name.toLowerCase(), slug);
    consumables.push({
      slug,
      gameId: id,
      kind: 'pill',
      nameEn: name,
      nameFr: null,
      quote: null,
      description: cells[4] ?? '',
      horseEffect: cells[5] || null,
      polarity: polRaw === '+' ? 'positive' : polRaw === '-' ? 'negative' : polRaw ? 'neutral' : null,
      unlockAchievementId: null,
      mask: 31,
      effects: null,
      notes: null,
      source: src('Pills', pills.revid),
    });
  }
}

/* ------------------------------------------------------------------ */
/* Objets                                                              */
/* ------------------------------------------------------------------ */
const qualityRows = groupBy(cargo('collectible_quality'), (r) => r.collectible!);
const quoteRows = groupBy(cargo('collectible_quote'), (r) => r.collectible!);
const rechargeRows = groupBy(cargo('collectible_recharge'), (r) => r.collectible!);
const tagRows = groupBy(cargo('collectible_tag'), (r) => r.collectible!);
const nameRows = groupBy(cargo('collectible_name'), (r) => r.collectible!);
const poolRows = groupBy(cargo('pool_collectible'), (r) => r.collectible!);
const itemPageById = new Map<number, string>();
const itemSlugs = new Set<string>();

const items: Item[] = [];
for (const [page, rows] of groupBy(collectibleRows, (r) => r._pageName!)) {
  const ref = pick(rows, REP) ?? rows[rows.length - 1]!;
  const alias = ref.alias!;
  if (keptPageForId.get(ref.id!) !== page) {
    warnings.push(`Objet « ${alias} » (ID ${ref.id}, masque ${orMask(rows)}) non inclus : identifiant réutilisé par « ${keptPageForId.get(ref.id!)} » dans la version de référence.`);
    continue;
  }
  const p = itemPages[page];
  const qRef = pick(qualityRows.get(alias) ?? [], REP);
  const qPlus = pick(qualityRows.get(alias) ?? [], REPP);
  const tags = [
    ...new Set(
      (tagRows.get(alias) ?? [])
        .filter((r) => mask(r) & REP || mask(r) === 0)
        .flatMap((r) => r.tag!.split(/[\s,]+/))
        .filter((t) => t && t !== '@value'),
    ),
  ];
  const effects = section(p, 'Effects', 'Effect');
  const familiar =
    tags.some((t) => ['baby', 'monstermanual', 'uniquefamiliar'].includes(t)) || /\bfamiliars?\b/i.test(markupToText(effects).split('\n')[0] ?? '');
  const quote = pick(quoteRows.get(alias) ?? [], REP)?.quote;
  const name = pick(nameRows.get(alias) ?? [], REP)?.name ?? alias;
  itemPageById.set(Number(ref.id), page);
  items.push({
    id: Number(ref.id),
    slug: uniqueSlug(name, itemSlugs),
    kind: ref.is_activated === '1' ? 'active' : 'passive',
    familiar,
    nameEn: name,
    nameFr: pageFr(p),
    quote: quote ? wikiToMarkup(quote) : null,
    description: md(ref.description) ?? '',
    quality: num(qRef?.quality),
    qualityRepPlus: num(qPlus?.quality),
    recharge: pick(rechargeRows.get(alias) ?? [], REP)?.recharge || null,
    tags,
    pools: (poolRows.get(alias) ?? []).map((r) => ({ pool: r.pool!, weight: Number(r.weight) || 0, mask: mask(r) })),
    unlockAchievementId: achievementName(ref.unlocked_by),
    mask: orMask(rows),
    effects,
    notes: section(p, 'Notes'),
    transformations: [],
    source: src(page, p?.revid ?? null),
  });
}
items.sort((a, b) => a.id - b.id);

/* ------------------------------------------------------------------ */
/* Trinkets                                                            */
/* ------------------------------------------------------------------ */
const tNames = groupBy(cargo('trinket_name'), (r) => r.trinket!);
const tQuotes = groupBy(cargo('trinket_quote'), (r) => r.trinket!);
const tTags = groupBy(cargo('trinket_tag'), (r) => r.trinket!);
const trinketPageById = new Map<number, string>();
const trinkets: Trinket[] = [];
for (const [page, rows] of groupBy(trinketRows, (r) => r._pageName!)) {
  const ref = pick(rows, REP) ?? rows[rows.length - 1]!;
  const alias = ref.alias!;
  const p = trinketPages[page];
  const name = pick(tNames.get(alias) ?? [], REP)?.name ?? alias;
  const quote = pick(tQuotes.get(alias) ?? [], REP)?.quote;
  trinketPageById.set(Number(ref.id), page);
  trinkets.push({
    id: Number(ref.id),
    slug: slugify(name),
    nameEn: name,
    nameFr: pageFr(p),
    quote: quote ? wikiToMarkup(quote) : null,
    description: md(ref.description) ?? '',
    tags: [...new Set((tTags.get(alias) ?? []).flatMap((r) => r.tag!.split(/[\s,]+/)).filter((t) => t && t !== '@value'))],
    unlockAchievementId: achievementName(ref.unlocked_by),
    mask: orMask(rows),
    effects: section(p, 'Effects', 'Effect'),
    notes: section(p, 'Notes'),
    source: src(page, p?.revid ?? null),
  });
}
trinkets.sort((a, b) => a.id - b.id);

// Compléments des consommables (descriptions balisées, sections de page).
for (const c of consumables) {
  if (c.kind === 'pill') {
    c.description = md(c.description) ?? '';
    c.horseEffect = md(c.horseEffect);
    continue;
  }
  const p = c._page ? pickupPages[c._page] : undefined;
  c.description = md(c.description) ?? '';
  c.effects = section(p, 'Effects', 'Effect');
  c.notes = section(p, 'Notes');
  c.unlockAchievementId = achievementName(c._unlock);
  delete c._page;
  delete c._unlock;
}

/* ------------------------------------------------------------------ */
/* Personnages                                                         */
/* ------------------------------------------------------------------ */
const editorial = curated<Record<string, NonNullable<Character['editorial']>>>('characters-editorial', {});
const byPlayer = (t: string) => groupBy(cargo(t), (r) => r.player!);
const dmg = byPlayer('player_damage');
const tears = byPlayer('player_tears');
const speed = byPlayer('player_speed');
const range = byPlayer('player_range');
const playerNames = byPlayer('player_name');
const BASE_ORDER = ['Isaac', 'Magdalene', 'Cain', 'Judas', '???', 'Eve', 'Samson', 'Azazel', 'Lazarus', 'Eden', 'The Lost', 'Lilith', 'Keeper', 'Apollyon', 'The Forgotten', 'Bethany', 'Jacob'];

function parseHealth(rendered: string): Record<string, number> {
  // Le rendu contient des images de cœurs et des indicateurs de version : on garde la partie valable en Repentance.
  const tokens = rendered
    .replace(/\[\[File:HUD heart (\w+)(?:&#32;| |_)(full|half)[^\]]*\]\]/gi, (_, kind: string, fill: string) => `♥${kind.toLowerCase()}:${fill === 'half' ? 0.5 : 1}♥`)
    .replace(/\[\[File:Dlc [^\]]*?cf-val-(\d+)[^\]]*\]\]/gi, '⟨$1⟩')
    .replace(/\[\[File:Unlockable[^\]]*\]\]/gi, '⊕')
    .replace(/<br\s*\/?>/gi, '\n');
  const health: Record<string, number> = {};
  for (const line of tokens.split('\n')) {
    // « ⊕ » = valeur alternative disponible après un déblocage : on garde la santé de départ de base.
    if (line.includes('⊕')) continue;
    let active = true;
    for (const part of line.split(/(⟨\d+⟩)/)) {
      const m = part.match(/^⟨(\d+)⟩$/);
      if (m) {
        active = (Number(m[1]) & REP) !== 0;
        continue;
      }
      if (!active) continue;
      for (const h of part.matchAll(/♥(\w+):([\d.]+)♥/g)) health[h[1]!] = (health[h[1]!] ?? 0) + Number(h[2]);
    }
  }
  return health;
}

const characters: Character[] = [];
for (const r of mainPlayers) {
  const alias = r.alias!;
  const slug = slugify(alias);
  const tainted = alias.startsWith('Tainted ');
  const baseName = tainted ? alias.replace(/^Tainted /, '') : null;
  const p = characterPages[r._pageName!];
  const startingMarkup = md(r.collectibles);
  const pickupsMarkup = md(r.pickups);
  const startingItems: EntityRef[] = [];
  for (const t of tokenize(`${startingMarkup ?? ''}\n${pickupsMarkup ?? ''}`)) {
    if (t.type !== 'link') continue;
    const kind = ({ i: 'item', t: 'trinket', p: 'consumable' } as const)[t.kind as 'i' | 't' | 'p'];
    if (kind && !startingItems.some((s) => s.kind === kind && s.key === t.target)) startingItems.push({ kind, key: t.target });
  }
  const val = (m: Map<string, Row[]>, f: string) => {
    const v = pick(m.get(alias) ?? [], REP)?.[f];
    return v ? markupToText(wikiToMarkup(v)).replace(/\n+/g, ' / ') || null : null;
  };
  const baseIndex = BASE_ORDER.indexOf(baseName ?? alias);
  characters.push({
    slug,
    nameEn: alias === 'Jacob' ? 'Jacob & Esau' : pick(playerNames.get(alias) ?? [], REP)?.name ?? alias,
    nameFr: p?.fr ? p.fr.replace(/\s*\(Personnage\)$/, '') : null,
    tainted,
    baseSlug: baseName ? slugify(baseName) : null,
    order: (tainted ? 100 : 0) + (baseIndex >= 0 ? baseIndex : 50),
    forms: playerRows.filter((f) => f.parent === alias).map((f) => f.alias!),
    health: parseHealth(r.health ?? ''),
    pickups: pickupsMarkup,
    startingItems,
    startingText: startingMarkup,
    stats: {
      damage: val(dmg, 'damage'),
      tears: val(tears, 'tears'),
      speed: val(speed, 'speed'),
      range: val(range, 'range_base'),
      shotSpeed: r.shot_speed || null,
      luck: r.luck || null,
    },
    unlockAchievementId: achievementName(r.unlocked_by),
    mask: orMask([r]),
    notes: section(p, 'Notes'),
    strategy: section(p, 'Strategy', 'General Strategies', 'Strategies'),
    editorial: editorial[alias]
      ? {
          difficulty: editorial[alias]!.difficulty,
          strengths: editorial[alias]!.strengths.map(canonical),
          weaknesses: editorial[alias]!.weaknesses.map(canonical),
          tips: editorial[alias]!.tips.map(canonical),
        }
      : null,
    source: src(r._pageName!, p?.revid ?? null),
  });
}
characters.sort((a, b) => a.order - b.order);
for (const c of characters) if (!c.editorial) warnings.push(`Pas d'avis éditorial pour ${c.nameEn}`);

/* ------------------------------------------------------------------ */
/* Marques de complétion (page « Completion Marks »)                   */
/* ------------------------------------------------------------------ */
type MarkDraft = Omit<CompletionMark, 'accessAchievementIds'> & { access: string[] };
const MARKS: MarkDraft[] = [
  { key: 'heart', order: 1, nameFr: 'Cœur de Maman / It Lives!', nameEn: "Mom's Heart / It Lives!", boss: "Mom's Heart", hardLabelFr: 'Mode difficile', mask: 31, access: [], description: "Vaincre Mom's Heart (It Lives! après 11 victoires) à la fin du Womb, de l'Utero ou du Scarred Womb." },
  { key: 'isaac', order: 2, nameFr: 'Isaac (Cathedral)', nameEn: 'Isaac', boss: 'Isaac', hardLabelFr: 'Mode difficile', mask: 31, access: [], description: 'Vaincre Isaac à la fin de la Cathedral.' },
  { key: 'satan', order: 3, nameFr: 'Satan (Sheol)', nameEn: 'Satan', boss: 'Satan', hardLabelFr: 'Mode difficile', mask: 31, access: [], description: 'Vaincre Satan à la fin du Sheol.' },
  { key: 'bluebaby', order: 4, nameFr: '??? (Chest)', nameEn: '???', boss: '???', hardLabelFr: 'Mode difficile', mask: 31, access: ['The Polaroid'], description: 'Vaincre ??? (Blue Baby) dans le Chest — The Polaroid est nécessaire pour y entrer depuis la Cathedral.' },
  { key: 'lamb', order: 5, nameFr: 'The Lamb (Dark Room)', nameEn: 'The Lamb', boss: 'The Lamb', hardLabelFr: 'Mode difficile', mask: 31, access: ['The Negative'], description: 'Vaincre The Lamb dans la Dark Room — The Negative facilite grandement l\'accès depuis le Sheol.' },
  { key: 'bossrush', order: 6, nameFr: 'Boss Rush', nameEn: 'Boss Rush', boss: 'Boss Rush', hardLabelFr: 'Mode difficile', mask: 31, access: [], description: 'Terminer le Boss Rush (porte ouverte si Mom est vaincue en moins de 20 minutes).' },
  { key: 'hush', order: 7, nameFr: 'Hush (Blue Womb)', nameEn: 'Hush', boss: 'Hush', hardLabelFr: 'Mode difficile', mask: 30, access: ['Blue Womb'], description: "Vaincre Hush dans le Blue Womb (porte ouverte si Mom's Heart est vaincu en moins de 30 minutes)." },
  { key: 'megasatan', order: 8, nameFr: 'Mega Satan', nameEn: 'Mega Satan', boss: 'Mega Satan', hardLabelFr: 'Mode difficile', mask: 30, access: [], description: 'Vaincre Mega Satan derrière la porte dorée du Chest ou de la Dark Room (Key Piece 1 + 2 ou clé dorée équivalente).' },
  { key: 'delirium', order: 9, nameFr: 'Delirium (The Void)', nameEn: 'Delirium', boss: 'Delirium', hardLabelFr: 'Mode difficile', mask: 28, access: ['New Area'], description: 'Vaincre Delirium au cœur de The Void.' },
  { key: 'mother', order: 10, nameFr: 'Mother (Corpse)', nameEn: 'Mother', boss: 'Mother', hardLabelFr: 'Mode difficile', mask: 24, access: ['A Secret Exit'], description: 'Vaincre Mother à la fin du Corpse (chemin alternatif Downpour/Dross → Mines/Ashpit → Mausoleum/Gehenna).' },
  { key: 'beast', order: 11, nameFr: 'The Beast (Home)', nameEn: 'The Beast', boss: 'The Beast', hardLabelFr: 'Mode difficile', mask: 24, access: ['A Strange Door'], description: "Vaincre Dogma puis The Beast dans Home, au terme de l'Ascension." },
  { key: 'greed', order: 12, nameFr: 'Ultra Greed / Greedier', nameEn: 'Greed / Greedier', boss: 'Ultra Greed', hardLabelFr: 'Greedier', mask: 30, access: [], description: 'Vaincre Ultra Greed en mode Greed ; la version « difficile » de cette marque correspond au mode Greedier (depuis Afterbirth+).' },
];
const completionMarks: CompletionMark[] = MARKS.map(({ access, ...m }) => {
  const resolved = access.map((n) => {
    const id = achievementName(n);
    if (!id) warnings.push(`Succès d'accès introuvable pour la marque ${m.key} : ${n}`);
    return id;
  });
  return { ...m, accessAchievementIds: resolved.filter((x): x is number => x !== null) };
});

const BOSS_TO_MARK: [RegExp, MarkKey, boolean][] = [
  [/Mom's Heart/i, 'heart', false],
  [/Ultra Greedier/i, 'greed', true],
  [/Ultra Greed/i, 'greed', false],
  [/Mega Satan/i, 'megasatan', false],
  [/Boss Rush/i, 'bossrush', false],
  [/Hush/i, 'hush', false],
  [/Delirium/i, 'delirium', false],
  [/Mother/i, 'mother', false],
  [/Beast/i, 'beast', false],
  [/Isaac/i, 'isaac', false],
  [/\?\?\?/, 'bluebaby', false],
  [/Satan/i, 'satan', false],
  [/Lamb/i, 'lamb', false],
];

const markUnlocks: MarkUnlock[] = [];
{
  const content = reference['Completion Marks']!.content;
  const tabs = content.split(/\n\s*\|-\|\s*\n|<tabber>|<\/tabber>/);
  for (const tab of tabs) {
    if (!tab.includes('wikitable')) continue;
    const headerPart = tab.slice(0, tab.indexOf('\n |-'));
    const columns = [...headerPart.matchAll(/!\s*(?:\{\{c\|([^}]+)\}\}<br>Unlock|(All [^<\n]*?)<br>Unlock)/g)].map((m) => m[1] ?? m[2]!);
    const rowsText = tab.slice(tab.indexOf('\n |-')).split(/\n\s*\|-\s*(?=\n)/).slice(1);
    const pending: ({ unlock: MarkUnlock; left: number } | null)[] = columns.map(() => null);
    for (const rowText of rowsText) {
      const lines = rowText.split('\n').map((l) => l.trim()).filter(Boolean);
      const cellLines = lines.filter((l) => l.startsWith('|') && !l.startsWith('|}') && !l.startsWith('|-'));
      const markEntry = cellLines.length >= 2 ? BOSS_TO_MARK.find(([re]) => re.test(cellLines[1]!)) : undefined;
      if (!markEntry) {
        // Ligne sans boss (ex. variante d'image d'une marque) : elle consomme quand même les cellules fusionnées (rowspan).
        for (const pend of pending) if (pend && pend.left > 0) pend.left--;
        continue;
      }
      const [, markKeyValue, hardRow] = markEntry;
      const cells = cellLines.slice(2);
      let ci = 0;
      for (let col = 0; col < columns.length; col++) {
        const pend = pending[col];
        if (pend && pend.left > 0) {
          if (!pend.unlock.marks.includes(markKeyValue)) pend.unlock.marks.push(markKeyValue);
          pend.left--;
          continue;
        }
        const cell = cells[ci++];
        if (!cell) continue;
        const rowspan = Number(cell.match(/rowspan="(\d+)"/)?.[1] ?? 1);
        const ach = cell.match(/\{\{achievement image \|\s*([^}]+?)\s*\}\}/)?.[1];
        const colName = columns[col]!;
        if (!ach || colName.startsWith('All ')) {
          pending[col] = null;
          continue;
        }
        const achievementId = achievementName(ach);
        const characterSlug = characterByName.get(colName.toLowerCase());
        if (!achievementId || !characterSlug) {
          warnings.push(`Marque non résolue : ${colName} / ${ach}`);
          pending[col] = null;
          continue;
        }
        const reqText = markupToText(wikiToMarkup(achievementRows.find((a) => Number(a.id) === achievementId)?.requirements ?? ''));
        const unlock: MarkUnlock = { characterSlug, achievementId, marks: [markKeyValue], hard: hardRow || /hard mode/i.test(reqText) };
        markUnlocks.push(unlock);
        pending[col] = rowspan > 1 ? { unlock, left: rowspan - 1 } : null;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Défis                                                               */
/* ------------------------------------------------------------------ */
const challengeNames = groupBy(cargo('challenge_name'), (r) => r.challenge!);
const challenges: Challenge[] = [];
for (const r of challengeRows) {
  const name = pick(challengeNames.get(r.alias!) ?? [], REP)?.name ?? r.alias!;
  challenges.push({
    number: Number(r.number),
    slug: slugify(name),
    name,
    goal: md(r.goal) ?? '',
    description: md(r.description) ?? '',
    character: r.used_character ? characterByName.get(r.used_character.toLowerCase()) ?? null : null,
    unlockAchievementId: achievementName(r.unlocked_by),
    rewardAchievementId: achievementName(r.unlocks),
    mask: mask(r),
    source: src(r._pageName!),
  });
}
challenges.sort((a, b) => a.number - b.number);

/* ------------------------------------------------------------------ */
/* Succès : typage, récompenses, prérequis, difficulté estimée         */
/* ------------------------------------------------------------------ */
const extraPrereqs = curated<Record<string, string[]>>('prerequisites', {});
const MARK_BASE_DIFFICULTY: Record<MarkKey, number> = {
  heart: 1, isaac: 2, satan: 2, bluebaby: 2.5, lamb: 2.5, bossrush: 2, hush: 3, megasatan: 3.5, greed: 2, delirium: 4, mother: 3.5, beast: 3.5,
};
const markUnlockByAchievement = new Map(markUnlocks.map((m) => [m.achievementId, m]));
const characterBySlug = new Map(characters.map((c) => [c.slug, c]));

const achievements: Achievement[] = achievementRows.map((r) => {
  const id = Number(r.id);
  const requirement = md(r.requirements) ?? '';
  const requirementText = markupToText(requirement);
  let kind: Achievement['kind'] = 'other';
  let coins: number | null = null;
  let challengeNumber: number | null = null;
  let characterSlug: string | null = null;
  const greed = requirementText.match(/Donate (\d+) [Cc]oins to the Greed Donation Machine/);
  const dono = requirementText.match(/Donate (\d+) [Cc]oins to the Donation Machine/);
  const chal = requirementText.match(/\(challenge #(\d+)\)/);
  const mu = markUnlockByAchievement.get(id);
  if (greed) {
    kind = 'greedDonation';
    coins = Number(greed[1]);
  } else if (dono) {
    kind = 'donation';
    coins = Number(dono[1]);
  } else if (mu) {
    kind = 'mark';
    characterSlug = mu.characterSlug;
  } else if (/Earn all .*Completion Marks/i.test(requirementText)) kind = 'allMarks';
  else if (chal) {
    kind = 'challenge';
    challengeNumber = Number(chal[1]);
  }
  if (!characterSlug) {
    const as = requirementText.match(/ as (Tainted [^,(]+?|[^,(]+?)(?: on Hard mode| without|,|$)/i);
    if (as) characterSlug = characterByName.get(as[1]!.trim().toLowerCase()) ?? null;
  }

  // Récompense : page liée au succès.
  const link = (r.link || '').split('#')[0]!;
  const lower = link.toLowerCase();
  let reward: Achievement['reward'] = { kind: 'other', key: null, label: r.description || r.name! };
  const unlockedCharacter = characters.find((c) => c.unlockAchievementId === id);
  const unlockedItem = items.find((i) => i.unlockAchievementId === id);
  const unlockedTrinket = trinkets.find((t) => t.unlockAchievementId === id);
  if (unlockedCharacter) reward = { kind: 'character', key: unlockedCharacter.slug, label: unlockedCharacter.nameEn };
  else if (unlockedItem) reward = { kind: 'item', key: String(unlockedItem.id), label: unlockedItem.nameEn };
  else if (unlockedTrinket) reward = { kind: 'trinket', key: String(unlockedTrinket.id), label: unlockedTrinket.nameEn };
  else if (pageKinds.get(link) === 'i' && itemByName.has(lower)) reward = { kind: 'item', key: String(itemByName.get(lower)), label: link };
  else if (pageKinds.get(link) === 't' && trinketByName.has(lower)) reward = { kind: 'trinket', key: String(trinketByName.get(lower)), label: link };
  else if (pageKinds.get(link) === 'p' && consumableByName.has(lower)) reward = { kind: 'consumable', key: consumableByName.get(lower)!, label: link };
  else if (pageKinds.get(link) === 'c' && /new character/i.test(r.description ?? '')) reward = { kind: 'character', key: characterByName.get(lower) ?? null, label: link };
  else if (floorByName.has(lower) && pageKinds.get(link) === 's') reward = { kind: 'floor', key: floorByName.get(lower)!, label: link };
  else if (/baby$/i.test(r.name!)) reward = { kind: 'baby', key: null, label: r.name! };
  else if (challenges.some((c) => c.unlockAchievementId === id)) {
    const c = challenges.find((x) => x.unlockAchievementId === id)!;
    reward = { kind: 'challenge', key: String(c.number), label: c.name };
  }

  const prereq = new Set<number>();
  if (characterSlug) {
    const ch = characterBySlug.get(characterSlug);
    if (ch?.unlockAchievementId && ch.unlockAchievementId !== id) prereq.add(ch.unlockAchievementId);
  }
  if (mu) {
    for (const mk of mu.marks) for (const a of completionMarks.find((m) => m.key === mk)!.accessAchievementIds) prereq.add(a);
    if (mu.marks.includes('greed') && mu.hard) {
      const g = achievementName('Greedier!');
      if (g) prereq.add(g);
    }
  }
  if (challengeNumber) {
    const c = challenges.find((x) => x.number === challengeNumber);
    if (c?.unlockAchievementId) prereq.add(c.unlockAchievementId);
  }
  for (const n of extraPrereqs[r.name!] ?? []) {
    const pid = achievementName(n);
    if (pid) prereq.add(pid);
    else warnings.push(`Prérequis éditorial introuvable : ${r.name} → ${n}`);
  }

  // Difficulté estimée (1-5), présentée comme une estimation.
  let difficulty = 3;
  if (kind === 'mark' && mu) {
    difficulty = Math.max(...mu.marks.map((m) => MARK_BASE_DIFFICULTY[m]));
    if (mu.hard) difficulty += 1;
    const ch = characterBySlug.get(mu.characterSlug);
    if (ch?.tainted) difficulty += 0.5;
    if ((ch?.editorial?.difficulty ?? 3) >= 4) difficulty += 0.5;
    if (mu.marks.length > 1) difficulty += 0.5;
  } else if (kind === 'donation' || kind === 'greedDonation') {
    difficulty = coins! <= 100 ? 1 : coins! <= 400 ? 2 : coins! <= 700 ? 3 : 4;
  } else if (kind === 'allMarks') difficulty = 5;
  difficulty = Math.min(5, Math.max(1, Math.round(difficulty)));

  return {
    id,
    name: r.name!,
    description: r.description ?? '',
    requirement,
    requirementText,
    mask: mask(r),
    kind,
    characterSlug,
    coins,
    challengeNumber,
    reward,
    prerequisites: [...prereq].filter((p) => p !== id),
    difficulty,
    source: src(r._pageName!),
  };
});
achievements.sort((a, b) => a.id - b.id);

/* ------------------------------------------------------------------ */
/* Transformations                                                     */
/* ------------------------------------------------------------------ */
const trNames = groupBy(cargo('transformation_name'), (r) => r.transformation ?? r._pageName!);
const trFr = curated<Record<string, string>>('transformations-fr', {});
const transformations: Transformation[] = cargo('transformation').map((r) => {
  const membersText = md(r.items) ?? '';
  const members: EntityRef[] = [];
  for (const t of tokenize(membersText)) {
    if (t.type !== 'link') continue;
    const kind = ({ i: 'item', t: 'trinket', p: 'consumable' } as const)[t.kind as 'i' | 't' | 'p'];
    if (kind && !members.some((m) => m.kind === kind && m.key === t.target)) members.push({ kind, key: t.target });
  }
  const name = pick(trNames.get(r.alias!) ?? [], REP)?.name ?? r.alias!;
  return {
    slug: slugify(name),
    id: Number(r.id),
    nameEn: name,
    nameFr: trFr[name] ?? null,
    description: md(r.description) ?? '',
    requirement: md(r.requirement) ?? '',
    members,
    membersText,
    mask: mask(r),
    source: src(r._pageName!),
  };
});
transformations.sort((a, b) => a.id - b.id);
for (const tr of transformations) {
  for (const m of tr.members) {
    if (m.kind !== 'item') continue;
    const it = items.find((i) => String(i.id) === m.key);
    if (it && !it.transformations.includes(tr.slug)) it.transformations.push(tr.slug);
  }
}

/* ------------------------------------------------------------------ */
/* Synergies & interactions (sections des pages du wiki)               */
/* ------------------------------------------------------------------ */
const NEGATIVE =
  /\b(overrid\w*|replac\w*|cancel\w*|no effect|does not|doesn't|don't|won't|will not|prevent\w*|remov\w*|disabl\w*|negat\w*|lose|loses|lost|worse|reduc\w*|nullif\w*|can't|cannot|unable|useless|instead of)\b/i;
const synergies: Synergy[] = [];
const refKinds = { i: 'item', t: 'trinket', p: 'consumable', c: 'character' } as const;
function extractSynergies(selfRef: EntityRef, page: PageExtract | undefined, pageName: string) {
  if (!page) return;
  for (const [title, kindSection] of [['Synergies', 'synergy'], ['Interactions', 'interaction']] as const) {
    const key = Object.keys(page.sections).find((k) => k.toLowerCase() === title.toLowerCase());
    if (!key) continue;
    const markup = md(page.sections[key]) ?? '';
    const lines = markup.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!/^\*[^*]/.test(line)) continue;
      const head = line.match(/^\*\s*((?:⟨\d+⟩\s*)*)((?:⟦[itpc]:[^⟧]+⟧\s*(?:\+|,|and|&|\/|or)?\s*)+):\s*(.*)$/);
      if (!head) continue;
      const lineMask = head[1] ? Number(head[1].match(/\d+/)![0]) : null;
      const targets = [...head[2]!.matchAll(/⟦([itpc]):([^⟧¦]+)/g)].map((m) => ({ kind: refKinds[m[1] as keyof typeof refKinds], key: m[2]! }));
      let text = head[3]!;
      while (lines[i + 1]?.startsWith('**')) text += `\n${lines[++i]!.slice(1)}`;
      for (const target of targets) {
        if (target.kind === selfRef.kind && target.key === selfRef.key) continue;
        synergies.push({
          a: selfRef,
          b: target,
          section: kindSection,
          text: text.trim(),
          possiblyNegative: kindSection === 'interaction' && NEGATIVE.test(markupToText(text)),
          mask: lineMask,
          source: src(pageName, page.revid),
        });
      }
    }
  }
}
for (const it of items) extractSynergies({ kind: 'item', key: String(it.id) }, itemPages[itemPageById.get(it.id)!], itemPageById.get(it.id)!);
for (const tr of trinkets) extractSynergies({ kind: 'trinket', key: String(tr.id) }, trinketPages[trinketPageById.get(tr.id)!], trinketPageById.get(tr.id)!);

/* ------------------------------------------------------------------ */
/* Boss                                                                */
/* ------------------------------------------------------------------ */
const bosses: Boss[] = [];
const usedBossSlugs = new Set<string>();
const bossesPerPage = groupBy(bossRows, (r) => r._pageName!);
for (const [alias, rows] of groupBy(bossRows, (r) => r.alias!)) {
  const ref = pick(rows, REP) ?? rows[0]!;
  const p = bossPages[ref._pageName!];
  // PV : seulement si la page décrit un seul boss (sinon la valeur de l'infobox serait ambiguë).
  const hpRaw = p && (bossesPerPage.get(ref._pageName!)?.length ?? 0) === 1 ? infoboxParam(p.infobox, 'base hp') : null;
  const hpMatch = hpRaw?.match(/^\s*(\d+(?:\.\d+)?)/);
  const env = p ? infoboxParam(p.infobox, 'environment') ?? '' : '';
  const floorsList = [...new Set([...env.matchAll(/\{\{floor\|([^}|]+)/gi)].map((m) => floorByName.get(m[1]!.trim().toLowerCase()) ?? slugify(m[1]!)))];
  let slug = slugify(alias);
  if (usedBossSlugs.has(slug)) slug = `${slug}-${ref.variant}`;
  usedBossSlugs.add(slug);
  bosses.push({
    slug,
    nameEn: alias,
    nameFr: p?.fr && (bossesPerPage.get(ref._pageName!)?.length ?? 0) === 1 ? p.fr : null,
    type: ref.type === 'mini-boss' ? 'mini-boss' : 'boss',
    entityId: num(ref.id),
    variant: num(ref.variant),
    hp: hpMatch ? Number(hpMatch[1]) : null,
    floors: floorsList,
    rewards: p ? md(infoboxParam(p.infobox, 'pool')) : null,
    behavior: section(p, 'Behavior', 'Behaviour', 'Attacks'),
    notes: section(p, 'Notes'),
    strategy: section(p, 'Strategies', 'Strategy', 'Tips'),
    unlockAchievementId: achievementName(ref.unlocked_by),
    mask: orMask(rows),
    source: src(ref._pageName!, p?.revid ?? null),
  });
}
bosses.sort((a, b) => a.nameEn.localeCompare(b.nameEn));

/* ------------------------------------------------------------------ */
/* Étages                                                              */
/* ------------------------------------------------------------------ */
const ALTERNATE = new Set(['downpour', 'dross', 'mines', 'ashpit', 'mausoleum', 'gehenna', 'corpse']);
const stageNames = groupBy(cargo('stage_name'), (r) => r.stage!);
const floors: Floor[] = [];
for (const [page, rows] of groupBy(stageRows, (r) => r._pageName!)) {
  const ref = pick(rows, REP) ?? rows[0]!;
  const slug = floorSlug(page);
  const bossesList = [...new Set(rows.flatMap((r) => `${r.bosses_1},${r.bosses_2}`.split(',')).map((b) => b.trim()).filter(Boolean))];
  floors.push({
    slug,
    nameEn: page === '??? (Floor)' ? 'Blue Womb (???)' : slug === 'greed-mode' ? 'Greed Mode' : pick(stageNames.get(ref.alias!) ?? [], REP)?.name ?? ref.alias!,
    nameFr: null,
    chapter: Math.min(...rows.map((r) => Number(r.chapter))),
    alternate: ALTERNATE.has(slug),
    mask: orMask(rows),
    unlockAchievementId: achievementName(ref.unlocked_by),
    bosses: bossesList.map((b) => bossByName.get(b.toLowerCase()) ?? slugify(b)),
    source: src(page),
  });
}
floors.sort((a, b) => a.chapter - b.chapter || Number(a.alternate) - Number(b.alternate) || a.nameEn.localeCompare(b.nameEn));

/* ------------------------------------------------------------------ */
/* Pools, dons, contenus éditoriaux                                    */
/* ------------------------------------------------------------------ */
const poolFr = curated<Record<string, string>>('pools-fr', {});
const pools: Pool[] = cargo('pool').map((r) => ({ key: r.alias!, nameEn: r.alias!, nameFr: poolFr[r.alias!] ?? null, greed: r.is_greed === '1', mask: mask(r) }));

const donationMilestones: DonationMilestone[] = achievements
  .filter((a) => (a.kind === 'donation' || a.kind === 'greedDonation') && a.coins)
  .map((a) => ({ machine: a.kind === 'donation' ? ('donation' as const) : ('greed' as const), coins: a.coins!, achievementId: a.id, label: a.name }))
  .sort((a, b) => a.machine.localeCompare(b.machine) || a.coins - b.coins);

/** Les contenus éditoriaux référencent les succès par leur nom : résolution + validation stricte. */
function ids(names: string[], ctx: string): number[] {
  return names.map((n) => {
    const id = achievementName(n);
    if (!id) throw new Error(`[${ctx}] succès introuvable : « ${n} »`);
    return id;
  });
}
function refByName(ref: EntityRef, ctx: string): EntityRef {
  const lower = ref.key.toLowerCase();
  const maps: Partial<Record<EntityRef['kind'], Map<string, string | number>>> = {
    item: itemByName, trinket: trinketByName, consumable: consumableByName, character: characterByName, boss: bossByName, floor: floorByName,
  };
  const key = maps[ref.kind]?.get(lower);
  if (key === undefined) throw new Error(`[${ctx}] référence introuvable : ${ref.kind} « ${ref.key} »`);
  return { kind: ref.kind, key: String(key) };
}
type Named<T, K extends string> = Omit<T, K> & Record<K, string[]>;
const guides: Guide[] = curated<Named<Guide, 'achievementIds'>[]>('guides', []).map((g) => ({
  ...g,
  related: g.related.map((r) => refByName(r, `guide ${g.slug}`)),
  steps: g.steps.map((s) => ({ ...s, body: canonical(s.body) })),
  tips: g.tips.map(canonical),
  risks: g.risks.map(canonical),
  alternatives: g.alternatives.map(canonical),
  prerequisites: g.prerequisites.map(canonical),
  versionNotes: g.versionNotes.map((v) => ({ ...v, text: canonical(v.text) })),
  summary: canonical(g.summary),
  achievementIds: ids(g.achievementIds, `guide ${g.slug}`),
}));
type PathDraft = Omit<PlannerPath, 'goalAchievementIds' | 'steps'> & {
  goalAchievementIds: string[];
  steps: (Omit<PlannerPath['steps'][number], 'achievementIds'> & { achievementIds: string[] })[];
};
const plannerPaths: PlannerPath[] = curated<PathDraft[]>('planner-paths', []).map((p) => ({
  ...p,
  summary: canonical(p.summary),
  goalAchievementIds: ids(p.goalAchievementIds, `parcours ${p.slug}`),
  steps: p.steps.map((s) => ({ ...s, body: canonical(s.body), achievementIds: ids(s.achievementIds, `parcours ${p.slug}`) })),
}));
const routes: Route[] = curated<Named<Route, 'achievementIds'>[]>('routes', []).map((r) => ({
  ...r,
  summary: canonical(r.summary),
  requirements: r.requirements.map(canonical),
  stages: r.stages.map((s) => ({ ...s, note: s.note ? canonical(s.note) : null })),
  achievementIds: ids(r.achievementIds, `route ${r.slug}`),
}));
const tips = curated<{ text: string; source: string }[]>('tips', []).map((t) => ({ ...t, text: canonical(t.text) }));

/* ------------------------------------------------------------------ */
/* Assemblage, validation, rapport                                     */
/* ------------------------------------------------------------------ */
const counts = {
  items: items.length, trinkets: trinkets.length, consumables: consumables.length, characters: characters.length,
  achievements: achievements.length, markUnlocks: markUnlocks.length, transformations: transformations.length,
  synergies: synergies.length, bosses: bosses.length, floors: floors.length, challenges: challenges.length,
  guides: guides.length, plannerPaths: plannerPaths.length, routes: routes.length, tips: tips.length, pools: pools.length,
};
const body = {
  items, trinkets, consumables: consumables as Consumable[], characters, achievements, completionMarks, markUnlocks, transformations, pools,
  synergies, bosses, floors, challenges, donationMilestones, guides, plannerPaths, routes, tips,
};
const datasetVersion = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
const data: Dataset = {
  meta: {
    datasetVersion,
    builtAt: new Date().toISOString(),
    sources: [{ name: manifest.source, url: manifest.url, license: manifest.license, licenseUrl: manifest.licenseUrl, fetchedAt: manifest.fetchedAt, method: manifest.method }],
    counts,
    referenceVersion: 'repentance',
  },
  ...body,
};

const parsed = datasetSchema.safeParse(data);
if (!parsed.success) {
  console.error(JSON.stringify(parsed.error.issues.slice(0, 15), null, 2));
  throw new Error('Le jeu de données généré ne respecte pas le schéma.');
}
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'dataset.json'), JSON.stringify(data));

/* Rapport de couverture */
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)} %` : '—');
const filled = <T,>(arr: T[], f: (x: T) => unknown) =>
  arr.filter((x) => {
    const v = f(x);
    return !(v === null || v === '' || (Array.isArray(v) && v.length === 0));
  }).length;
const characterMarkCoverage = characters
  .map((c) => `| ${c.nameEn} | ${markUnlocks.filter((m) => m.characterSlug === c.slug).length} | ${c.editorial ? 'oui' : 'non'} |`)
  .join('\n');
const report = `# Rapport de couverture des données

> Généré automatiquement par \`npm run data:build\` le ${new Date().toISOString().slice(0, 10)}.
> Version du jeu de données : \`${datasetVersion}\` — données brutes récupérées le ${verifiedAt.slice(0, 10)}.

## Source et licence

- **${manifest.source}** — ${manifest.url}
- Licence : **${manifest.license}** (${manifest.licenseUrl}). Les textes de jeu (descriptions, effets, notes, synergies)
  sont des extraits de ce wiki : ils restent sous CC BY-SA 4.0 et chaque fiche indique sa page source et sa révision.
- Méthode : ${manifest.method}. Aucune page HTML n'a été aspirée : seules les tables Cargo et les sections utiles des pages ont été extraites.
- **Sprites : aucun.** Les images du jeu appartiennent à leurs ayants droit. L'application génère des emblèmes
  pixel-art neutres et accepte des sprites fournis légalement par l'utilisateur (voir README).

## Volumes

| Catégorie | Entrées | Remarques |
|---|---:|---|
| Objets (collectibles) | ${items.length} | qualité : ${pct(filled(items, (i) => i.quality), items.length)} ; nom FR : ${pct(filled(items, (i) => i.nameFr), items.length)} ; pools : ${pct(filled(items, (i) => i.pools), items.length)} ; effets détaillés : ${pct(filled(items, (i) => i.effects), items.length)} |
| Trinkets | ${trinkets.length} | nom FR : ${pct(filled(trinkets, (i) => i.nameFr), trinkets.length)} ; effets détaillés : ${pct(filled(trinkets, (i) => i.effects), trinkets.length)} |
| Consommables | ${consumables.length} | cartes/runes/pierres d'âme/autres : ${consumables.filter((c) => c.kind !== 'pill').length}, pilules : ${consumables.filter((c) => c.kind === 'pill').length} |
| Personnages | ${characters.length} | dont ${characters.filter((c) => c.tainted).length} Tainted ; avis éditorial : ${characters.filter((c) => c.editorial).length} |
| Succès | ${achievements.length} | liés à une marque : ${achievements.filter((a) => a.kind === 'mark').length} ; paliers de dons : ${donationMilestones.length} ; défis : ${achievements.filter((a) => a.kind === 'challenge').length} |
| Déblocages de marques (personnage × marque) | ${markUnlocks.length} | issus du tableau « Completion Marks » du wiki |
| Transformations | ${transformations.length} | |
| Synergies / interactions | ${synergies.length} | synergies : ${synergies.filter((s) => s.section === 'synergy').length}, interactions : ${synergies.filter((s) => s.section === 'interaction').length} (dont ${synergies.filter((s) => s.possiblyNegative).length} signalées « possiblement négatives » par heuristique) |
| Boss et mini-boss | ${bosses.length} | PV renseignés : ${bosses.filter((b) => b.hp !== null).length} |
| Étages | ${floors.length} | |
| Défis (challenges) | ${challenges.length} | |
| Guides (rédaction française) | ${guides.length} | |
| Parcours du planificateur | ${plannerPaths.length} | |
| Routes | ${routes.length} | |
| Astuces | ${tips.length} | |

## Déblocages de marques par personnage

| Personnage | Déblocages liés aux marques | Avis éditorial |
|---|---:|---|
${characterMarkCoverage}

## Limites connues

- **Traductions françaises** : les noms français proviennent des liens interlangues du wiki (wiki francophone communautaire) quand ils existent ;
  sinon le nom anglais est affiché. Les descriptions, effets et notes restent en **anglais** (langue de la source) ; l'interface,
  les guides, les parcours et les astuces sont rédigés en français. Des traductions peuvent être importées (voir \`docs/IMPORT-DONNEES.md\`).
- **Familiers** : le wiki n'expose pas de champ « familier » ; la classification est déduite des tags (baby, monstermanual, uniquefamiliar)
  et du texte d'effet. Elle peut contenir quelques erreurs.
- **Interactions négatives** : le wiki ne distingue pas synergies et anti-synergies ; les interactions dont le texte contient des
  formulations négatives sont signalées « possiblement négatives » (heuristique, affichée comme telle dans l'interface).
- **Difficulté des succès** : estimation calculée (marque, mode difficile, personnage) — ce n'est pas une donnée du jeu.
- **Points de vie des boss** : renseignés uniquement quand la page du boss n'en décrit qu'un seul.
- **Plateformes** : le wiki ne documente pas les différences par console de manière structurée. La Nintendo Switch reçoit les mêmes
  extensions (Repentance puis Repentance+) ; aucune différence de contenu par plateforme n'est affirmée sans source.
- Liens internes non résolus (convertis en texte simple) : ${unresolvedLinks}.

## Avertissements de construction

${warnings.length ? warnings.map((w) => `- ${w}`).join('\n') : '- Aucun.'}
`;
mkdirSync(path.resolve('docs'), { recursive: true });
writeFileSync(path.resolve('docs/COUVERTURE-DONNEES.md'), report);
console.log('Jeu de données généré :', counts, `version ${datasetVersion}`);
if (warnings.length) console.warn(`${warnings.length} avertissement(s) :\n - ${warnings.slice(0, 50).join('\n - ')}`);
