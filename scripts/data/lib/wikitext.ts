/**
 * Conversion wikitext (MediaWiki + modèles du wiki Isaac) et chaînes Cargo « rendues »
 * vers le balisage interne d'Isaac Codex (voir packages/shared/src/markup.ts).
 */

/** Codes de Template:Dlcset → masque de bits (copie exacte du modèle du wiki). */
export const DLC_CODES: Record<string, number> = {
  na: 1, 'ana+': 2, 'na+': 3, 'a+nr': 4, 'naa+nr': 5, anr: 6, nr: 7, 'rnr+': 8, 'narnr+': 9, 'ana+rnr+': 10,
  'na+rnr+': 11, 'a+nr+': 12, 'naa+nr+': 13, 'anr+': 14, 'nr+': 15, 'r+': 16, 'nar+': 17, 'ana+r+': 18,
  'na+r+': 19, 'a+nrr+': 20, 'naa+nrr+': 21, 'anrr+': 22, 'nrr+': 23, r: 24, nar: 25, 'ana+r': 26, 'na+r': 27,
  'a+': 28, 'naa+': 29, a: 30, n: 31, x: 31, '': 31,
};

export function dlcMask(code: string | undefined): number | null {
  if (code === undefined) return null;
  const k = code.trim().toLowerCase().replace(/†/g, '+');
  if (/^\d+$/.test(k)) return Number(k);
  return DLC_CODES[k] ?? null;
}

export type LinkResolver = (page: string) => string | null;

const LINK_TEMPLATES: Record<string, string> = {
  i: 'i', t: 't', p: 'p', c: 'c', e: 'e', s: 's', a: 'a', floor: 's', ip: 'pool', b: 'e', boss: 'e',
};
const PLAIN_TEMPLATES = new Set(['r', 'room', 'g', 'code', 'nowrap', 'small', 'tt', 'm', 'w', 'key', 'button', 'anchor']);

function splitParams(inner: string): { name: string; positional: string[]; named: Record<string, string> } {
  const parts = inner.split('|');
  const name = parts.shift()!.trim();
  const positional: string[] = [];
  const named: Record<string, string> = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0 && /^[\w ]+$/.test(p.slice(0, eq).trim())) named[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
    else positional.push(p.trim());
  }
  return { name, positional, named };
}

function link(kind: string, target: string, label?: string): string {
  const t = target.replace(/[⟦⟧¦]/g, '').trim();
  if (!t) return label ?? '';
  return label && label !== t ? `⟦${kind}:${t}¦${label}⟧` : `⟦${kind}:${t}⟧`;
}

function renderTemplate(inner: string): string {
  const { name, positional, named } = splitParams(inner);
  const lname = name.toLowerCase();
  if (lname.startsWith('#')) return '';
  const linkKind = LINK_TEMPLATES[lname];
  if (linkKind) {
    const target = positional[0] ?? '';
    return link(linkKind, target, named.text);
  }
  if (lname === 'dlc' || lname === 'dlc+') {
    const mask = dlcMask(positional[0]);
    const content = lname === 'dlc' && positional[1] ? ` ${positional[1]}` : '';
    return mask !== null && mask !== 31 ? `⟨${mask}⟩${content}` : content;
  }
  if (lname === 'dlc-') return '';
  if (lname.endsWith(' synergy')) {
    const itemName = name.slice(0, -' synergy'.length).trim();
    return `${link('i', itemName)}: ${named.description ?? positional[0] ?? ''}`;
  }
  if (PLAIN_TEMPLATES.has(lname)) return named.text ?? positional[1] ?? positional[0] ?? '';
  if (lname === 'color' || lname === 'colour') return positional[1] ?? '';
  if (lname === 'dlcalt') return positional[0] ?? '';
  if (lname === '!') return '|';
  return '';
}

/** Remplace les modèles du plus interne au plus externe. */
function expandTemplates(s: string): string {
  let prev = '';
  let guard = 0;
  while (prev !== s && guard++ < 20) {
    prev = s;
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_, inner: string) => renderTemplate(inner));
  }
  return s.replace(/\{\{|\}\}/g, '');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;|&#32;|&#160;/g, ' ')
    .replace(/&zwj;/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

export function wikiToMarkup(input: string | null | undefined, resolve: LinkResolver = () => null): string {
  if (!input) return '';
  let s = input;
  // Chaînes Cargo rendues : infobulles → liens typés.
  s = s.replace(
    /<span class="tooltip" data-tooltip="(\w+)%2Ftooltip%7C([^"]+)"[^>]*>[\s\S]*?\[\[:[^\]]*\]\]<\/span>/g,
    (_, k: string, n: string) => link(k, decodeURIComponent(n.replace(/\+/g, ' '))),
  );
  // Indicateurs de version rendus.
  s = s.replace(/\[\[File:Dlc [^\]]*?cf-val-(\d+)[^\]]*\]\]/gi, (_, m: string) => (m === '31' ? '' : `⟨${m}⟩`));
  s = s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<gallery[\s\S]*?<\/gallery>/gi, '');
  s = s.replace(/\{\|[\s\S]*?\n\|\}/g, ''); // tableaux
  // Fichiers / catégories / interwikis (avec légendes imbriquées éventuelles).
  for (let i = 0; i < 3; i++) s = s.replace(/\[\[(?:File|Image|Category|[a-z]{2}(?:-[a-z]+)?):(?:[^[\]]|\[\[[^\]]*\]\])*\]\]/gi, '');
  s = s.replace(/\[\[:?([^\]|]+)\|([^\]]*)\]\]/g, (_, page: string, label: string) => {
    const kind = resolve(page.split('#')[0]!.trim());
    return kind ? link(kind, page.split('#')[0]!.trim(), label.trim()) : label;
  });
  s = s.replace(/\[\[:?([^\]|]+)\]\]/g, (_, page: string) => {
    const kind = resolve(page.split('#')[0]!.trim());
    return kind ? link(kind, page.split('#')[0]!.trim()) : page.split('#').pop()!;
  });
  s = expandTemplates(s);
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/'''?/g, '').replace(/__[A-Z]+__/g, '');
  s = s.replace(/\[https?:\/\/\S+ ([^\]]+)\]/g, '$1').replace(/\[https?:\/\/\S+\]/g, '');
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l && !/^[*#:]+$/.test(l) && !/^=+.*=+$/.test(l))
    .join('\n')
    .trim();
}

/** Valeur d'un paramètre d'infobox brute ({{infobox ... | key = value }}). */
export function infoboxParam(infobox: string, key: string): string | null {
  const re = new RegExp(`\\|\\s*${key.replace(/ /g, '\\s+')}\\s*=\\s*([\\s\\S]*?)(?=\\n\\s*\\||\\n\\}\\})`, 'i');
  const m = infobox.match(re);
  return m ? m[1]!.trim() : null;
}
