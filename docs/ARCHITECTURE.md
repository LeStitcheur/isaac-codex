# Architecture

```
isaac-codex/
  apps/server/         Fastify 5 + Drizzle ORM + better-sqlite3 (API REST + service du frontend compilé)
    drizzle/           migrations SQL générées (drizzle-kit)
    src/db/            schéma, client, seed, sauvegardes
    src/lib/           erreurs, authentification des profils, modèle de lecture en mémoire + recherche floue
    src/routes/        game (données), profiles (progression), tools (santé, simulateur, comparaison, sprites)
  apps/web/            React 19 + Vite 7 + Tailwind 4 + composants style shadcn/ui (Radix) + TanStack Query + Zustand
  packages/shared/     code partagé serveur/frontend : schémas Zod, versions, balisage, progression, recommandations, simulateur
  packages/game-data/  raw/ (cache API), curated/ (rédaction FR), generated/dataset.json
  scripts/             fetch/build/import des données, install.sh, start.sh
  pterodactyl/         egg + documentation
  tests/               Vitest (unitaires, données, API, migrations, sécurité, persistance)
  e2e/                 Playwright (parcours essentiels, desktop + mobile)
  data/                base SQLite, sauvegardes, sprites utilisateur (persistant, ignoré par git)
```

**Une seule application, un seul port** : le binaire `dist/server/index.js` sert `/api/*`, `/sprites/*` et le frontend `dist/web` (fallback SPA). Un seul `package.json` (pas de workspaces) : plus simple à déployer sur Pterodactyl, l'alias `@isaac-codex/shared` est résolu à la compilation (tsup/Vite).

## Choix importants

- **SQLite source de vérité, lecture en mémoire.** Les ~10 000 lignes de données de jeu sont normalisées en base (31 tables, index, clés étrangères), puis chargées dans un modèle en mémoire (~30 Mo) au démarrage : filtres et recherche floue instantanés, même sur un petit VPS.
- **Profils découplés des données du jeu.** Les tables `profile_*` référencent les entités par leurs clés stables (pas de clés étrangères vers les tables de jeu), ce qui permet de réimporter les données sans perte. Les clés étrangères vers `profiles` sont en `ON DELETE CASCADE`.
- **Progression calculée par du code partagé.** `computeStatuses` (statuts verrouillé/disponible/en cours/débloqué), `computeStats` et `recommend` tournent côté serveur (API) **et** côté client (mises à jour instantanées). Les succès se déduisent des marques cochées (tableau officiel du wiki) et des dons déclarés ; un statut manuel l'emporte toujours.
- **Balisage interne** `⟦i:105¦The D6⟧` / `⟨24⟩` : liens typés résolus à la construction (un lien introuvable devient du texte), marqueurs de version permettant d'atténuer les lignes qui ne concernent pas la version choisie.
- **Recherche** : Fuse.js (pondération noms FR/EN, identifiants) puis reclassement par distance de Damerau-Levenshtein (fautes de frappe), bonus aux correspondances exactes.
- **Sécurité** : jetons de 256 bits hachés (SHA-256), mots de passe scrypt, 404 sur tout profil non autorisé, Zod sur chaque entrée, limitation de débit globale et renforcée sur l'authentification, CSP stricte.

## Modèle de données (principales tables)

Jeu : `game_versions`, `sources`, `translations`, `items`, `item_tags`, `item_pools`, `item_pool_entries`, `trinkets`, `consumables` (cartes, runes, pierres d'âme, pilules), `characters`, `character_stats`, `character_starting_items`, `achievements`, `unlock_conditions`, `unlock_dependencies`, `completion_marks`, `character_unlocks`, `character_unlock_marks`, `donation_milestones`, `challenges`, `transformations`, `transformation_requirements`, `item_synergies`, `bosses`, `floors`, `floor_routes`, `guides`, `guide_steps`, `planner_paths`, `tips`, `app_meta`.

Profils : `profiles`, `profile_tokens`, `profile_settings`, `profile_unlocks`, `profile_completion_marks`, `profile_favorites`, `profile_donations`, `profile_items` (objets vus/ramassés, distincts des déblocages), `profile_history`.

## API

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/health` | santé |
| GET | `/api/meta` | méta-données, marques, pools, transformations, personnages, paliers, parcours |
| GET | `/api/search?q=&kinds=&limit=` | recherche universelle tolérante aux fautes |
| GET | `/api/characters`, `/api/characters/:slug` | personnages |
| GET | `/api/items?q=&kind=&quality=&pool=&version=&transformation=&tag=&unlocked=&favorites=&sort=&page=&pageSize=` | objets (filtres + pagination) |
| GET | `/api/items/index`, `/api/items/:id`, `/api/items/:id/synergies` | index compact, fiche, synergies |
| GET | `/api/trinkets[/:id]`, `/api/consumables[/:slug]` | trinkets, consommables |
| GET | `/api/unlocks[/:id]` | succès |
| GET | `/api/bosses[/:slug]`, `/api/floors[/:slug]`, `/api/routes` | boss, étages, routes |
| GET | `/api/guides[/:slug]`, `/api/transformations`, `/api/challenges` | guides, transformations, défis |
| GET | `/api/donations/milestones`, `/api/planner/paths`, `/api/tips/random`, `/api/random/item` | dons, parcours, astuces |
| GET | `/api/synergies/compare?a=item:1&b=item:2` | comparaison |
| POST | `/api/builds/analyze` | simulateur de build |
| POST | `/api/profiles`, `/api/profiles/login`, `/api/profiles/import` | création, connexion, import |
| GET | `/api/profiles/me` | profil du jeton |
| GET/PATCH | `/api/profiles/:id/progress` | progression (jeton requis) |
| GET | `/api/profiles/:id/stats`, `/api/profiles/:id/recommendations` | statistiques, planificateur |
| POST | `/api/profiles/:id/export`, `/api/profiles/:id/logout` | export JSON, révocation du jeton |
| PATCH/DELETE | `/api/profiles/:id` | renommer / mot de passe, suppression |
