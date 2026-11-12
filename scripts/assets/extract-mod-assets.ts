/**
 * Découpe les planches graphiques de deux mods Steam Workshop installés localement
 * (Better Character Menu, External Item Descriptions) en images individuelles pour l'interface.
 *
 * ⚠ Ces images dérivent des graphismes officiels du jeu (droits : Edmund McMillen / Nicalis) et des auteurs des mods.
 *   Elles sont intégrées au build à la demande du propriétaire de l'instance, pour un usage personnel.
 *   Ne les redistribuez pas publiquement sans autorisation.
 *
 * Usage : npm run assets:extract [-- --mods "D:/SteamLibrary/steamapps/common/The Binding of Isaac Rebirth/mods"]
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const MODS = args.includes('--mods')
  ? args[args.indexOf('--mods') + 1]!
  : process.env.ISAAC_MODS_DIR ?? 'D:/SteamLibrary/steamapps/common/The Binding of Isaac Rebirth/mods';
const BCM = path.join(MODS, 'better character menu_835236871/resources/gfx/ui/main menu');
const EID = path.join(MODS, 'external item descriptions_836319872/resources/gfx');
const OUT = path.resolve('apps/web/public/game-assets');
const MANIFEST = path.resolve('apps/web/src/generated/game-assets.json');

interface Crop { x: number; y: number; w: number; h: number }
type Anm2 = Map<string, { layers: Map<string, Crop[]> }>;

/** Lecture minimale d'un .anm2 : animation → nom de calque → cadres (zones de découpe). */
function readAnm2(file: string): Anm2 {
  const xml = readFileSync(file, 'utf8');
  const layerNames = new Map<string, string>();
  for (const m of xml.matchAll(/<Layer\s+Id="(\d+)"\s+Name="([^"]*)"/g)) layerNames.set(m[1]!, m[2]!);
  const out: Anm2 = new Map();
  for (const chunk of xml.split(/<Animation\s+Name=/).slice(1)) {
    const name = chunk.match(/^"([^"]+)"/)![1]!;
    const layers = new Map<string, Crop[]>();
    for (const la of chunk.matchAll(/<LayerAnimation\s+LayerId="(\d+)"[\s\S]*?<\/LayerAnimation>/g)) {
      const frames: Crop[] = [];
      for (const f of la[0].matchAll(/<Frame\s[^>]*>/g)) {
        const g = (k: string) => Number(f[0].match(new RegExp(`\\s${k}="(-?[\\d.]+)"`))?.[1] ?? NaN);
        if (Number.isNaN(g('XCrop'))) continue;
        // Un cadre de durée N occupe N positions sur la ligne de temps (l'index utilisé par le jeu).
        const crop = { x: g('XCrop'), y: g('YCrop'), w: g('Width'), h: g('Height') };
        for (let d = 0; d < Math.max(1, g('Delay') || 1); d++) frames.push(crop);
      }
      layers.set(layerNames.get(la[1]!) ?? la[1]!, frames);
    }
    out.set(name, { layers });
  }
  return out;
}

const pngCache = new Map<string, PNG>();
function png(file: string): PNG {
  if (!pngCache.has(file)) {
    // Certains PNG du jeu ont des octets après le bloc IEND, que pngjs refuse.
    const buf = readFileSync(file);
    const end = buf.lastIndexOf('IEND');
    pngCache.set(file, PNG.sync.read(end > 0 ? buf.subarray(0, end + 8) : buf));
  }
  return pngCache.get(file)!;
}

const manifest: Record<string, Record<string, string>> = {};
/** Découpe une zone, retire les marges transparentes (sauf trim = false) et l'enregistre. */
function save(group: string, key: string, sheet: string, c: Crop | undefined, trim = true) {
  if (!c || c.w <= 0 || c.h <= 0) return;
  const src = png(sheet);
  let minX = c.w, minY = c.h, maxX = -1, maxY = -1;
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const sx = c.x + x, sy = c.y + y;
      if (sx >= src.width || sy >= src.height) continue;
      if (src.data[(sy * src.width + sx) * 4 + 3]! > 8) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  if (maxX < 0) return;
  if (!trim) [minX, minY, maxX, maxY] = [0, 0, c.w - 1, c.h - 1];
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(src, out, c.x + minX, c.y + minY, w, h, 0, 0);
  mkdirSync(path.join(OUT, group), { recursive: true });
  writeFileSync(path.join(OUT, group, `${key}.png`), PNG.sync.write(out));
  (manifest[group] ??= {})[key] = `/game-assets/${group}/${key}.png`;
}

/**
 * Ressources du jeu lui-même, extraites des archives .a par l'outil officiel ResourceExtractor (dossier tools/ du jeu).
 * Lancé automatiquement si le cache est absent ; sinon : --resources "<dossier extrait>" ou ISAAC_RESOURCES_DIR.
 */
const GAME = process.env.ISAAC_GAME_DIR ?? path.resolve(MODS, '..');
const RESOURCES = args.includes('--resources')
  ? args[args.indexOf('--resources') + 1]!
  : process.env.ISAAC_RESOURCES_DIR ?? path.resolve('.cache/game-resources');

function ensureGameResources(): boolean {
  if (existsSync(path.join(RESOURCES, 'resources/gfx/items'))) return true;
  const tool = path.join(GAME, 'tools/ResourceExtractor');
  if (!existsSync(path.join(tool, 'ResourceExtractor.exe'))) {
    console.warn(`ResourceExtractor introuvable (${tool}) : sprites d'objets, trinkets et boss ignorés.`);
    return false;
  }
  console.log('Extraction des archives du jeu (≈ 1 Go, une seule fois)…');
  // L'outil lit filelist.txt dans le dossier courant et attend Entrée à deux reprises.
  spawnSync(path.join(tool, 'ResourceExtractor.exe'), [GAME, RESOURCES], { cwd: tool, input: '\n\n\n', stdio: ['pipe', 'ignore', 'inherit'] });
  return existsSync(path.join(RESOURCES, 'resources/gfx/items'));
}

/** Fichiers d'un dossier du jeu ; la version Repentance (resources-dlc3) remplace la version de base. */
function gameFiles(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const root of ['resources', 'resources-dlc3']) {
    const full = path.join(RESOURCES, root, dir);
    if (existsSync(full)) for (const f of readdirSync(full)) files.set(f, path.join(full, f));
  }
  return files;
}

function copy(group: string, key: string, file: string) {
  mkdirSync(path.join(OUT, group), { recursive: true });
  copyFileSync(file, path.join(OUT, group, `${key}.png`));
  (manifest[group] ??= {})[key] = `/game-assets/${group}/${key}.png`;
}

function extractGameResources() {
  if (!ensureGameResources()) return;
  const dataset = JSON.parse(readFileSync(path.resolve('packages/game-data/generated/dataset.json'), 'utf8')) as {
    bosses: { slug: string; nameEn: string; entityId: number; variant: number }[];
  };

  for (const [dir, re, group] of [
    ['gfx/items/collectibles', /^collectibles_(\d+)_.*\.png$/, 'items'],
    ['gfx/items/trinkets', /^trinket_(\d+)_.*\.png$/, 'trinkets'],
  ] as const)
    for (const [f, file] of gameFiles(dir)) {
      const id = f.match(re)?.[1];
      if (id) copy(group, String(Number(id)), file);
    }

  // Portraits de boss (écran « VS ») : par type.variante, sinon par nom de fichier.
  const portraits = [...gameFiles('gfx/ui/boss')].filter(([f]) => f.startsWith('portrait_'));
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const b of dataset.bosses) {
    const byId = portraits.find(([f]) => f.startsWith(`portrait_${b.entityId}.${b.variant}_`));
    const byName = portraits.find(([f]) => [norm(b.slug), norm(b.nameEn)].includes(norm(f.replace(/^portrait_[\d.]+_/, '').replace(/\.png$/, ''))));
    const hit = byId ?? byName;
    if (hit) save('bosses', b.slug, hit[1], { x: 0, y: 0, w: png(hit[1]).width, h: png(hit[1]).height });
  }

  // Marques de complétion (feuille de progression du menu de pause) : ligne du bas = normal, ligne du haut = difficile.
  const widget = gameFiles('gfx/ui').get('completion_widget.png');
  const widgetAnm = gameFiles('gfx/ui').get('completion_widget.anm2');
  if (widget && widgetAnm) {
    const idle = readAnm2(widgetAnm).get('Idle');
    for (const [key, layer] of Object.entries(MARK_LAYERS)) {
      // Delirium n'a pas de calque dans l'animation : son icône est la seule case libre de la ligne (x = 96).
      const c = (layer && idle?.layers.get(layer)?.find((f) => f.w > 0)) || { x: 96, y: 112, w: 16, h: 16 };
      save('marks', key, widget, c, false);
      save('marks', `${key}-hard`, widget, { ...c, y: c.y - 16 }, false);
    }
  }

  // Logo du titre (moitié haute de la planche ; la moitié basse est son ombre floutée).
  const logo = gameFiles('gfx/ui/main menu').get('logo.png');
  if (logo) save('ui', 'logo', logo, { x: 0, y: 0, w: png(logo).width, h: Math.floor(png(logo).height / 2) });
}

/* --- Correspondances (énumération PlayerType du jeu → slugs d'Isaac Codex) --- */
const PLAYER_TYPES: Record<number, string> = {
  0: 'isaac', 1: 'magdalene', 2: 'cain', 3: 'judas', 4: 'bluebaby', 5: 'eve', 6: 'samson', 7: 'azazel', 8: 'lazarus', 9: 'eden',
  10: 'the-lost', 13: 'lilith', 14: 'keeper', 15: 'apollyon', 16: 'the-forgotten', 18: 'bethany', 19: 'jacob',
  21: 'tainted-isaac', 22: 'tainted-magdalene', 23: 'tainted-cain', 24: 'tainted-judas', 25: 'tainted-bluebaby', 26: 'tainted-eve',
  27: 'tainted-samson', 28: 'tainted-azazel', 29: 'tainted-lazarus', 30: 'tainted-eden', 31: 'tainted-lost', 32: 'tainted-lilith',
  33: 'tainted-keeper', 34: 'tainted-apollyon', 35: 'tainted-forgotten', 36: 'tainted-bethany', 37: 'tainted-jacob',
};
const MENU_ANIMS: Record<string, string> = {
  '01_Isaac': 'isaac', '02_Magdalene': 'magdalene', '03_Cain': 'cain', '04_Judas': 'judas', '05_Eve': 'eve', '06_Bluebaby': 'bluebaby',
  '07_Samson': 'samson', '08_Azazel': 'azazel', '09_Lazarus': 'lazarus', '10_Eden': 'eden', '11_TheLost': 'the-lost', '12_Lilith': 'lilith',
  '13_Keeper': 'keeper', '15_Apollyon': 'apollyon', '16_TheForgotten': 'the-forgotten', '17_Bethany': 'bethany', '18_JacobEsau': 'jacob',
};
const HEARTS = ['red', 'red-half', 'eternal', 'empty', 'blended', 'bone', 'bone-half', 'bone-empty', 'soul', 'soul-half', 'black', 'black-half', 'golden', 'coin', 'coin-half', 'coin-empty', 'rotten', 'broken', 'holy-mantle'];
const STATS = ['damage', 'speed', 'tears', 'range', 'shotSpeed', 'luck'];
const PICKUPS = ['key', 'golden-key', 'bomb', 'golden-bomb', 'coin', 'rune', 'card', 'red-card', 'pill', 'battery', 'poop', 'grab-bag', 'black-sack'];
const ROOMS: Record<number, string> = {
  0: 'shop', 1: 'secret', 2: 'super-secret', 3: 'library', 4: 'treasure', 5: 'angel', 6: 'devil', 7: 'mini-boss', 8: 'boss', 9: 'challenge',
  10: 'boss-rush', 11: 'curse', 12: 'sacrifice', 13: 'arcade', 15: 'dice', 16: 'chest', 17: 'bedroom', 19: 'ultra-secret', 20: 'planetarium',
  22: 'red-chest', 23: 'golden-chest', 26: 'mirror', 33: 'wooden-chest', 35: 'error',
};
/** Marque de complétion → calque de completion_widget.anm2. */
const MARK_LAYERS: Record<string, string | null> = {
  heart: 'Heart', isaac: 'Cross', satan: 'UpsideDownCross', bluebaby: 'Polaroid', lamb: 'Negative', bossrush: 'Star',
  hush: 'Hush', megasatan: 'MegaSatan', delirium: null, mother: 'Knife', beast: 'DadsNote', greed: 'Greed',
};
const MACHINES = ['slot', 'blood-donation', 'fortune-teller', 'confessional', 'donation', 'restock', 'mirror', 'crane-game', 'revive'];
const BEGGARS = ['beggar', 'devil-beggar', 'battery-bum', 'key-master', 'bomb-bum', 'rotten-beggar'];
const TRANSFORMATIONS: Record<string, string> = {
  Transformation1: 'guppy', Transformation2: 'fun-guy', Transformation3: 'beelzebub', Transformation4: 'conjoined', Transformation5: 'spun',
  Transformation6: 'yes-mother', Transformation7: 'oh-crap', Transformation8: 'bob', Transformation9: 'leviathan', Transformation10: 'seraphim',
  Transformation11: 'super-bum', Transformation12: 'bookworm', Transformation13: 'spider-baby', Transformation14: 'adult', Transformation15: 'stompy',
  Transformation16: 'necromancer',
};

function main() {
  for (const dir of [BCM, EID]) if (!existsSync(dir)) throw new Error(`Dossier introuvable : ${dir}`);
  rmSync(OUT, { recursive: true, force: true });

  // Better Character Menu : portraits, noms manuscrits, note « WHO AM I? » (normal + Tainted/alt).
  for (const [variant, prefix] of [['', ''], ['alt', 'tainted-']] as const) {
    const sheet = path.join(BCM, `charactermenu${variant}.png`);
    const menu = readAnm2(path.join(BCM, `charactermenu${variant}.anm2`));
    const portraits = readAnm2(path.join(BCM, `characterportraits${variant}.anm2`));
    for (const [anim, slug] of Object.entries(MENU_ANIMS)) {
      const key = `${prefix}${slug}`;
      const p = portraits.get(anim);
      save('portraits', key, sheet, p ? [...p.layers.values()][0]?.[0] : undefined);
      save('names', key, sheet, menu.get(anim)?.layers.get('Name')?.[0]);
    }
    if (!variant) save('ui', 'paper', sheet, menu.get('01_Isaac')?.layers.get('Background')?.[0]);
    else save('ui', 'paper-tainted', sheet, menu.get('01_Isaac')?.layers.get('Background')?.[0]);
  }

  // External Item Descriptions : têtes des personnages, icônes en ligne, transformations, cartes.
  const players = readAnm2(path.join(EID, 'eid_player_icons.anm2')).get('Players');
  const playerFrames = players ? [...players.layers.values()][0] ?? [] : [];
  for (const [i, slug] of Object.entries(PLAYER_TYPES)) save('characters', slug, path.join(EID, 'eid_player_icons.png'), playerFrames[Number(i)]);

  const inline = readAnm2(path.join(EID, 'eid_inline_icons.anm2'));
  const inlineSheet = path.join(EID, 'eid_inline_icons.png');
  const frames = (anim: string) => [...(inline.get(anim)?.layers.values() ?? [])][0] ?? [];
  HEARTS.forEach((k, i) => save('hearts', k, inlineSheet, frames('hearts')[i]));
  [0, 1, 2, 3, 4].forEach((q) => save('quality', `q${q}`, inlineSheet, frames('Quality')[q]));
  STATS.forEach((k, i) => save('stats', k, inlineSheet, frames('Stats')[i]));
  save('stats', 'angel', inlineSheet, frames('Stats')[6]);
  save('stats', 'devil', inlineSheet, frames('Stats')[7]);
  PICKUPS.forEach((k, i) => save('pickups', k, inlineSheet, frames('pickups')[i]));
  for (const [i, k] of Object.entries(ROOMS)) save('rooms', k, inlineSheet, frames('roomicons')[Number(i)]);
  MACHINES.forEach((k, i) => save('machines', k, inlineSheet, frames('machines')[i]));
  BEGGARS.forEach((k, i) => save('beggars', k, inlineSheet, frames('Beggars')[i]));
  ['active', 'familiar'].forEach((k) => save('ui', k, path.join(EID, 'eid_transform_icons.png'), [...(readAnm2(path.join(EID, 'eid_transform_icons.anm2')).get(k)?.layers.values() ?? [])][0]?.[0]));

  const tr = readAnm2(path.join(EID, 'eid_transform_icons.anm2'));
  for (const [anim, slug] of Object.entries(TRANSFORMATIONS)) save('transformations', slug, path.join(EID, 'eid_transform_icons.png'), [...(tr.get(anim)?.layers.values() ?? [])][0]?.[0]);

  const cp = readAnm2(path.join(EID, 'eid_cardspills.anm2'));
  const cards = [...(cp.get('Cards')?.layers.values() ?? [])][0] ?? [];
  cards.forEach((c, i) => save('cards', String(i + 1), path.join(EID, 'eid_cardspills.png'), c)); // cadre i = carte d'identifiant i+1

  extractGameResources();

  mkdirSync(path.dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log('Ressources extraites :', Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, Object.keys(v).length])));
}

main();
