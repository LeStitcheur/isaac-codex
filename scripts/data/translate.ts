/**
 * Traduction en français des textes détaillés du jeu de données, via l'API Claude (Message Batches : −50 %).
 *
 *   npm run data:translate -- --dry-run          estimation (aucun appel, aucun coût)
 *   npm run data:translate                       traduit tout ce qui manque (synergies comprises)
 *   npm run data:translate -- --skip-synergies   fiches seulement
 *   npm run data:translate -- --limit 50         essai sur 50 textes
 *   npm run data:translate -- --model claude-sonnet-5-5
 *
 * Clé : ANTHROPIC_API_KEY (ou un profil `ant auth login`). Le lot soumis est mémorisé dans .cache/translate-batch.json :
 * si le script est interrompu, relancez-le, il reprend le même lot sans le repayer.
 * Résultat : packages/game-data/curated/translations-fr.json (à committer). Seuls les textes manquants ou dont
 * l'anglais a changé sont envoyés. Une traduction qui altère le balisage (liens ⟦…⟧, icônes ⟨…⟩) est rejetée.
 */
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dataset as datasetSchema } from '../../packages/shared/src/index.js';
import { readTranslations, sourceHash, translatableUnits, translationsPath, type TranslationFile } from '../../apps/server/src/db/translations.js';

const root = process.cwd();
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const MODEL = option('model') ?? process.env.TRANSLATE_MODEL ?? 'claude-opus-5-5';
const CHUNK_CHARS = Number(option('chunk-chars') ?? 10_000);
const CHUNK_UNITS = 40;
const STATE_FILE = path.join(root, '.cache/translate-batch.json');

const SYSTEM = `Tu traduis de l'anglais vers le français les textes d'un wiki de fans du jeu vidéo The Binding of Isaac (Rebirth, Afterbirth, Repentance).

Règles :
- Français naturel et précis, ton encyclopédique impersonnel. Garde le vocabulaire courant des joueurs francophones (tears → larmes, pickup → consommable, run → partie, room → salle, floor → étage, devil deal → pacte avec le diable, item pool → pool d'objets, familiar → familier).
- Les NOMS PROPRES du jeu restent en anglais, exactement comme en jeu : objets, trinkets, cartes, runes, pilules, personnages, boss, étages, transformations, défis, succès (ex. Brimstone, The Sad Onion, Mom's Heart, Tainted Lazarus, Sheol, Guppy).
- Le balisage doit être recopié À L'IDENTIQUE, caractère pour caractère : les liens ⟦type:clé¦Libellé⟧ (ne traduis ni la clé ni le libellé), les icônes ⟨…⟩, les puces en début de ligne (*, **, ***), les retours à la ligne, les nombres, les pourcentages et les touches.
- Ne rajoute, ne supprime ni ne résume aucune information. Si un texte ne contient rien à traduire, renvoie-le tel quel.

Entrée : un tableau JSON d'objets {"id", "text"}. Sortie : {"translations": [{"id", "fr"}]} avec exactement un élément par id reçu.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, fr: { type: 'string' } },
        required: ['id', 'fr'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
};

/** Balisage qui doit survivre à la traduction : liens, icônes, puces de liste. */
function markupSignature(text: string): string {
  const tokens = text.match(/⟦[^⟧]*⟧|⟨[^⟩]*⟩/g) ?? [];
  const bullets = text.split('\n').map((l) => l.match(/^\*+/)?.[0] ?? '');
  return JSON.stringify([tokens.sort(), bullets]);
}

interface PendingUnit {
  id: string;
  src: string;
  text: string;
}
interface BatchState {
  batchId: string;
  model: string;
  chunks: Record<string, PendingUnit[]>;
}

function loadDataset() {
  const file = path.join(root, 'packages/game-data/generated/dataset.json');
  return datasetSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

function saveTranslations(file: TranslationFile) {
  const sorted = Object.fromEntries(Object.entries(file.entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(translationsPath(root), `${JSON.stringify({ ...file, entries: sorted }, null, 1)}\n`);
}

function chunk(items: PendingUnit[]): PendingUnit[][] {
  const out: PendingUnit[][] = [];
  let cur: PendingUnit[] = [];
  let size = 0;
  for (const it of items) {
    if (cur.length && (size + it.text.length > CHUNK_CHARS || cur.length >= CHUNK_UNITS)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(it);
    size += it.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Textes à traduire + estimation. Renvoie null si rien à faire ou en mode --dry-run. */
function plan(): PendingUnit[] | null {
  const units = translatableUnits(loadDataset(), { synergies: !flag('skip-synergies') });
  const existing = readTranslations(root);
  const unique = [...new Map(units.map((u) => [u.id, u])).values()];
  let todo = unique.filter((u) => existing?.entries[u.id]?.src !== sourceHash(u.text)).map((u) => ({ id: u.id, src: sourceHash(u.text), text: u.text }));
  const limit = option('limit');
  if (limit) todo = todo.slice(0, Number(limit));
  const chars = todo.reduce((n, u) => n + u.text.length, 0);
  // Estimation grossière : ~3,3 caractères par token, sortie française ~25 % plus longue, enveloppe JSON + consignes.
  const inTok = chars / 3.3 + todo.length * 15 + Math.ceil(todo.length / CHUNK_UNITS) * 450;
  const outTok = (chars * 1.25) / 3.3 + todo.length * 15;
  console.log(`${units.length} textes traduisibles, ${units.length - todo.length} déjà traduits, ${todo.length} à traduire (${(chars / 1e6).toFixed(2)} M caractères).`);
  console.log(`Estimation : ~${Math.round(inTok / 1000)} k tokens en entrée, ~${Math.round(outTok / 1000)} k en sortie (modèle ${MODEL}, Batch API à −50 %).`);
  return todo.length && !flag('dry-run') ? todo : null;
}

async function submit(client: Anthropic, todo: PendingUnit[]): Promise<BatchState> {
  const state: BatchState = { batchId: '', model: MODEL, chunks: {} };
  const requests = chunk(todo).map((c, i) => {
    const customId = `chunk-${i}`;
    state.chunks[customId] = c;
    return {
      custom_id: customId,
      params: {
        model: MODEL,
        max_tokens: 32_000,
        system: SYSTEM,
        output_config: { effort: 'low' as const, format: { type: 'json_schema' as const, schema: OUTPUT_SCHEMA } },
        messages: [{ role: 'user' as const, content: JSON.stringify(c.map((u, j) => ({ id: String(j), text: u.text }))) }],
      },
    };
  });
  const batch = await client.messages.batches.create({ requests });
  state.batchId = batch.id;
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state));
  console.log(`Lot ${batch.id} soumis : ${requests.length} requêtes. (En cas d'interruption, relancer la commande reprend ce lot.)`);
  return state;
}

async function collect(client: Anthropic, state: BatchState) {
  for (;;) {
    const b = await client.messages.batches.retrieve(state.batchId);
    const c = b.request_counts;
    console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${b.processing_status} — en cours ${c.processing}, réussies ${c.succeeded}, erreurs ${c.errored}, expirées ${c.expired}`);
    if (b.processing_status === 'ended') break;
    await new Promise((r) => setTimeout(r, 30_000));
  }

  const file: TranslationFile = readTranslations(root) ?? { model: state.model, updatedAt: '', entries: {} };
  let ok = 0;
  let rejected = 0;
  let failedRequests = 0;
  for await (const res of await client.messages.batches.results(state.batchId)) {
    const units = state.chunks[res.custom_id];
    if (!units) continue;
    if (res.result.type !== 'succeeded') {
      failedRequests++;
      continue;
    }
    const msg = res.result.message;
    if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') {
      console.warn(`${res.custom_id} : arrêt « ${msg.stop_reason} », textes ignorés.`);
      failedRequests++;
      continue;
    }
    const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let parsed: { translations: { id: string; fr: string }[] };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      failedRequests++;
      continue;
    }
    for (const t of parsed.translations) {
      const u = units[Number(t.id)];
      if (!u || !t.fr.trim()) continue;
      if (markupSignature(u.text) !== markupSignature(t.fr)) {
        rejected++;
        continue;
      }
      file.entries[u.id] = { src: u.src, fr: t.fr };
      ok++;
    }
  }
  file.model = state.model;
  file.updatedAt = new Date().toISOString();
  saveTranslations(file);
  rmSync(STATE_FILE, { force: true });
  console.log(`${ok} traductions enregistrées dans ${path.relative(root, translationsPath(root))}.`);
  if (rejected) console.log(`${rejected} rejetées (balisage modifié) : relancez la commande pour les retenter.`);
  if (failedRequests) console.log(`${failedRequests} requêtes en échec : relancez la commande pour les retenter.`);
}

async function main() {
  const resume: BatchState | null = existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as BatchState) : null;
  if (resume) {
    if (flag('dry-run')) return console.log(`Un lot est en cours (${resume.batchId}) : relancez sans --dry-run pour le récupérer.`);
    console.log(`Reprise du lot ${resume.batchId}.`);
    return collect(new Anthropic(), resume);
  }
  const todo = plan();
  if (!todo) return;
  const client = new Anthropic();
  await collect(client, await submit(client, todo));
}

main().catch((e) => {
  if (e instanceof Anthropic.AuthenticationError) console.error('Clé API invalide ou absente : définissez ANTHROPIC_API_KEY.');
  else if (e instanceof Anthropic.RateLimitError) console.error('Limite de débit atteinte : réessayez dans quelques minutes.');
  else if (e instanceof Anthropic.APIError) console.error(`Erreur de l'API (${e.status}) : ${e.message}`);
  else console.error(e);
  process.exit(1);
});
