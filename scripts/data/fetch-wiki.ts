/**
 * Récupération ciblée des données structurées du wiki communautaire
 * « The Binding of Isaac: Rebirth Wiki » (bindingofisaacrebirth.wiki.gg).
 *
 * Licence du contenu : CC BY-SA 4.0 (vérifiée via l'API siteinfo, enregistrée dans le manifeste).
 * Usage : référence (conforme au Content-Signal « use=reference » du robots.txt), aucun entraînement d'IA.
 *
 * Le script est volontairement lent (~1 requête/seconde), utilise l'API officielle MediaWiki/Cargo
 * (pas de scraping HTML) et met en cache chaque réponse dans packages/game-data/raw/.
 * Il n'est PAS exécuté au runtime : l'application fonctionne hors-ligne à partir des JSON générés.
 *
 * Usage : npm run data:fetch [-- --force]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const API = 'https://bindingofisaacrebirth.wiki.gg/api.php';
const UA = 'IsaacCodex/1.0 (unofficial fan encyclopedia; low-rate data refresh; CC BY-SA attribution)';
const RAW_DIR = path.resolve('packages/game-data/raw');
const DELAY_MS = 1100;
const force = process.argv.includes('--force');

let lastRequest = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api(params: Record<string, string>): Promise<any> {
  const wait = lastRequest + DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const url = new URL(API);
  for (const [k, v] of Object.entries({ ...params, format: 'json', formatversion: '2' })) url.searchParams.set(k, v);
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = (await res.json()) as any;
      if (json.error) throw new Error(`API error ${json.error.code}: ${json.error.info}`);
      return json;
    }
    console.warn(`HTTP ${res.status} (tentative ${attempt}) ${url.search.slice(0, 120)}`);
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
  throw new Error(`Échec définitif : ${url}`);
}

async function cached<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const file = path.join(RAW_DIR, `${name}.json`);
  if (!force && existsSync(file)) return JSON.parse(await readFile(file, 'utf8')) as T;
  const data = await fn();
  await writeFile(file, JSON.stringify(data, null, 1));
  return data;
}

async function cargoAll(table: string, where?: string, cacheName = table): Promise<Record<string, string>[]> {
  return cached(`cargo-${cacheName}`, async () => {
    const fieldsInfo = await api({ action: 'cargofields', table });
    const fields = ['_pageName', ...Object.keys(fieldsInfo.cargofields)];
    const rows: Record<string, string>[] = [];
    for (let offset = 0; ; offset += 500) {
      const params: Record<string, string> = {
        action: 'cargoquery',
        tables: table,
        fields: fields.map((f) => `${table}.${f}=${f}`).join(','),
        limit: '500',
        offset: String(offset),
      };
      if (where) params.where = where;
      const json = await api(params);
      const batch = (json.cargoquery as { title: Record<string, string> }[]).map((r) => r.title);
      rows.push(...batch);
      if (batch.length < 500) break;
    }
    console.log(`  ${table}: ${rows.length} lignes`);
    return rows;
  });
}

/** Ne garde que les sections utiles d'une page pour limiter le volume stocké. */
const KEPT_SECTIONS =
  /^(effects?|notes|synergies|interactions|unlock.*|behaviou?r|attacks?|strateg(y|ies)|general strategies|tips|mechanics|donation rewards|rewards|phases?)$/i;

function extractSections(content: string) {
  const out: { infobox: string; sections: Record<string, string>; fr: string | null } = { infobox: '', sections: {}, fr: null };
  const fr = content.match(/\{\{nav\|[^}]*fr=([^|}]+)/i);
  out.fr = fr ? fr[1]!.trim() : null;
  const firstHeading = content.search(/^==[^=]/m);
  out.infobox = (firstHeading >= 0 ? content.slice(0, firstHeading) : content).slice(0, 4000);
  const parts = content.split(/^==([^=].*?)==\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i]!.replace(/\[\[|\]\]/g, '').trim();
    if (KEPT_SECTIONS.test(title)) out.sections[title] = parts[i + 1]!.trim().slice(0, 12000);
  }
  return out;
}

type PageExtract = { revid: number; timestamp: string } & ReturnType<typeof extractSections>;

async function pages(name: string, titles: string[]) {
  return cached(`pages-${name}`, async () => {
    const result: Record<string, PageExtract> = {};
    for (let i = 0; i < titles.length; i += 50) {
      const chunk = titles.slice(i, i + 50);
      const json = await api({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content|ids|timestamp',
        rvslots: 'main',
        redirects: '1',
        titles: chunk.join('|'),
      });
      for (const p of json.query.pages) {
        if (p.missing || !p.revisions) continue;
        const rev = p.revisions[0];
        result[p.title] = { revid: rev.revid, timestamp: rev.timestamp, ...extractSections(rev.slots.main.content) };
      }
      for (const r of json.query.redirects ?? []) if (result[r.to]) result[r.from] = result[r.to]!;
      console.log(`  pages ${name}: ${Math.min(i + 50, titles.length)}/${titles.length}`);
    }
    return result;
  });
}

async function fullPages(name: string, titles: string[]) {
  return cached(`full-${name}`, async () => {
    const json = await api({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content|ids|timestamp',
      rvslots: 'main',
      redirects: '1',
      titles: titles.join('|'),
    });
    const result: Record<string, { revid: number; timestamp: string; content: string }> = {};
    for (const p of json.query.pages) {
      if (p.missing || !p.revisions) continue;
      result[p.title] = { revid: p.revisions[0].revid, timestamp: p.revisions[0].timestamp, content: p.revisions[0].slots.main.content };
    }
    return result;
  });
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const site = await cached('siteinfo', () => api({ action: 'query', meta: 'siteinfo', siprop: 'rightsinfo|general' }));
  console.log(`Source : ${site.query.general.sitename} — licence ${site.query.rightsinfo.text}`);

  const tables = [
    'version', 'collectible', 'collectible_name', 'collectible_quality', 'collectible_quote', 'collectible_recharge',
    'collectible_tag', 'pool', 'pool_collectible', 'trinket', 'trinket_name', 'trinket_quote', 'trinket_tag',
    'pickup', 'pickup_name', 'pickup_quote', 'pickup_recharge', 'achievement', 'player', 'player_name',
    'player_damage', 'player_tears', 'player_speed', 'player_range', 'transformation', 'transformation_name',
    'stage', 'stage_name', 'challenge', 'challenge_name', 'entity_health',
  ];
  for (const t of tables) await cargoAll(t);
  // La table entity est volumineuse : on la limite aux boss et mini-boss.
  const bosses = await cargoAll('entity', "entity.type IN ('boss','mini-boss')", 'entity-bosses');
  await cargoAll('entity_name', undefined, 'entity_name');

  const collectibles = await cargoAll('collectible');
  const trinkets = await cargoAll('trinket');
  const pickups = await cargoAll('pickup');
  const players = await cargoAll('player');
  const uniq = (rows: Record<string, string>[]) => [...new Set(rows.map((r) => r._pageName!).filter(Boolean))];

  await pages('collectibles', uniq(collectibles));
  await pages('trinkets', uniq(trinkets));
  await pages('pickups', uniq(pickups));
  await pages('characters', uniq(players));
  await pages('bosses', uniq(bosses));
  await fullPages('reference', ['Pills', 'Donation Machine', 'Greed Donation Machine', 'Completion Marks', 'Transformations']);
  // Pages de référence servant à rédiger (et vérifier) les guides en français.
  await fullPages('guides', [
    'The Lost', 'The Forgotten', 'Keeper', 'Tainted Characters', 'Home', 'Mother', 'The Beast', 'Hush', 'Delirium',
    'Mega Satan', 'Boss Rush', "Mom's Box", 'Missing Poster', 'Greed Mode', 'Greedier Mode', 'Ascent', 'Corpse',
    'Mausoleum', 'Downpour', 'Dross', 'The Void', 'Dead God', 'Red Key', 'Cracked Key', 'Knife Piece 1', 'Knife Piece 2',
    'Mines', 'Ashpit', 'Strange Door', 'Chapters', 'Completion Marks', 'Achievements',
  ]);

  const manifest = {
    source: site.query.general.sitename,
    url: site.query.general.base,
    license: site.query.rightsinfo.text,
    licenseUrl: site.query.rightsinfo.url,
    fetchedAt: new Date().toISOString(),
    method: 'API MediaWiki (action=cargoquery, action=query&prop=revisions), ~1 requête/s',
  };
  await writeFile(path.join(RAW_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Terminé.', manifest);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
