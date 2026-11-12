# ISAAC CODEX

Encyclopédie interactive **non officielle** de *The Binding of Isaac* (Rebirth → Afterbirth → Afterbirth+ → Repentance → Repentance+), en français, avec suivi de progression personnel.

> Isaac Codex est un wiki communautaire non officiel, sans affiliation avec Edmund McMillen, Nicalis ou les détenteurs des droits.

## Fonctionnalités

- **Recherche universelle** (Ctrl/⌘ + K ou `/`) tolérante aux fautes de frappe, noms français et anglais, identifiants (`105`, `t23`).
- **Objets** : 719 objets, 188 trinkets, 97 cartes/runes/pierres d'âme et autres consommables, 50 pilules. Filtres par type, qualité, pool, version, transformation, étiquette, état de déblocage (selon le profil) et favoris. Fiches détaillées : effets, notes, pools avec poids, déblocage, transformations, synergies et interactions sourcées, état « vu / ramassé ».
- **Personnages** : 34 personnages (17 Tainted), statistiques, vie, objets de départ, analyse (difficulté, forces, faiblesses, stratégies), **grille des marques de complétion** cliquable (normal / difficile) avec les déblocages exacts associés.
- **Suivi des déblocages** : 641 succès, statuts Verrouillé / Disponible / En cours / Débloqué, déduction automatique depuis les marques et les dons, progression globale, par personnage, par type de récompense, par catégorie et par version.
- **Que débloquer ensuite ?** : recommandations expliquées (prérequis, difficulté estimée, utilité, objectifs ouverts, préférences) et 7 parcours (The Lost, The Forgotten, Keeper, Tainted, D6, Greedier, Dead God).
- **Synergies** : 7 054 synergies/interactions documentées, comparaison de deux objets, transformations, **simulateur de build**.
- **Guides** : 14 guides rédigés en français (dont les 12 prioritaires), avec prérequis, étapes, conseils, risques, alternatives et notes par version.
- **Machines de dons** : Donation Machine et Greed Donation Machine, paliers, prochaine récompense, progression.
- **Boss et étages** : 123 boss/mini-boss, 27 étages, 6 routes illustrées (normale, Cathedral/Chest, Sheol/Dark Room, Void, Mother, The Beast).
- **Profils** sans compte : plusieurs profils, progression/favoris/paramètres indépendants (version du jeu, plateforme dont Nintendo Switch), mot de passe facultatif, **export/import JSON**, sauvegardes SQLite.
- Interface sombre façon tableau de bord (même système visuel que LeStitcheur), sprites du jeu, responsive (mobile), barre latérale repliable.

Version de référence : **Repentance** ; les différences Repentance+ et des anciennes versions sont signalées (badges, lignes atténuées hors version).

## Démarrage rapide (local)

Prérequis : Node.js 22 LTS ou plus récent.

```bash
npm install
npm run build
npm start                 # http://localhost:8080 (ou PORT=xxxx npm start)
```

Développement avec rechargement automatique :

```bash
npm run dev               # API sur :8080 (tsx watch) + Vite sur http://localhost:5173 (proxy /api)
```

Tests :

```bash
npm test                              # Vitest : unitaires, données, API, migrations, sécurité, persistance
npx playwright install chromium       # une seule fois
npm run build && npm run test:e2e     # Playwright sur l'application compilée (desktop + mobile)
npm run typecheck
```

## Déploiement sur Pterodactyl

1. Panel → Admin → Nests → **Import Egg** → `pterodactyl/egg-isaac-codex.json`.
2. Créez un serveur avec cet egg (512 Mo–1 Go de RAM, 1,5 Go de disque, une allocation). Laissez la variable `PORT` vide.
3. Envoyez le contenu du projet dans `/home/container` par SFTP (sans `node_modules`, `dist`, `data`), **ou** renseignez `GIT_REPO` puis *Reinstall Server*.
4. Démarrez : `scripts/start.sh` installe (`npm ci`), compile, migre et lance l'application sur le port attribué. La console affiche `Isaac Codex listening on …`.
5. Configurez un reverse proxy HTTPS sur l'hôte (exemples Caddy/Nginx dans `docs/DEPLOIEMENT.md`).

Détails : [`pterodactyl/README.md`](pterodactyl/README.md) · [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `NODE_ENV` | `production` | environnement |
| `PORT` | vide → `SERVER_PORT` → 8080 | port HTTP |
| `HOST` | `0.0.0.0` | interface d'écoute |
| `DATABASE_PATH` | `data/isaac-codex.sqlite` | base SQLite (dossier persistant) |
| `LOG_LEVEL` / `LOG_FORMAT` | `info` / `pretty` | journaux |
| `APP_BASE_URL` | — | URL publique (informative) |
| `TRUST_PROXY` | `true` | derrière un reverse proxy |
| `ALLOW_PROFILE_CREATION` | `true` | création de profils |
| `BACKUP_ON_START` / `BACKUP_KEEP` | `true` / `7` | sauvegardes automatiques |
| `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` | `300` / `10` | limitation de débit |
| `SPRITES_DIR` | `data/sprites` | sprites fournis par l'utilisateur |

## Données et sources

- Données de jeu issues de [The Binding of Isaac: Rebirth Wiki](https://bindingofisaacrebirth.wiki.gg/) (**CC BY-SA 4.0**), récupérées par son API officielle (tables Cargo), validées par Zod, avec source, révision, date de vérification et niveau de confiance pour chaque fiche.
- Rien n'est inventé : un champ inconnu reste vide. Les synergies proviennent exclusivement des sections « Synergies » / « Interactions » du wiki.
- **Rapport de couverture** : [`docs/COUVERTURE-DONNEES.md`](docs/COUVERTURE-DONNEES.md). **Import et régénération** : [`docs/IMPORT-DONNEES.md`](docs/IMPORT-DONNEES.md).
- **Images** : portraits, cœurs, icônes et cartes issus des mods locaux (voir « Style et ressources graphiques du jeu ») ; sprites des objets, trinkets, portraits de boss et logo extraits des archives du jeu installé. Une image ajoutée dans `data/sprites/` reste prioritaire ; à défaut, un emblème pixel-art généré est affiché (voir son README).

### Limites connues

- Descriptions, effets et notes en **anglais** (langue de la source) ; noms français issus du wiki francophone quand ils existent (85 % des objets, 94 % des trinkets) ; traductions importables en CSV/JSON.
- Classification « familier » et repérage des interactions « possiblement négatives » : heuristiques, affichées comme telles.
- Difficultés des succès et des personnages : estimations éditoriales.
- Simulateur : cumul des modificateurs simples décrits, sans simulation du moteur (plafonds, formule de cadence, effets conditionnels).
- Différences propres aux plateformes (dont Switch) : non documentées de façon structurée par la source, donc non affirmées.

## Style et ressources graphiques du jeu

L'interface suit le système visuel de LeStitcheur : fond ardoise très sombre, cartes bordées, accent rouge `#ff4157`, polices DM Sans (texte) et Barlow Condensed (marque), barre latérale à sections et barre supérieure avec fil d'Ariane.

Les portraits, noms manuscrits, cœurs, icônes de qualité/statistiques/salles/transformations et faces de cartes sont découpés depuis deux mods Steam Workshop installés localement :

- *Better Character Menu* (`mods/better character menu_835236871/resources/gfx/ui/main menu`)
- *External Item Descriptions* (`mods/external item descriptions_836319872/resources/gfx`, Wofsauge et contributeurs)

```bash
npm run assets:extract                                   # chemin par défaut D:/SteamLibrary/.../mods
npm run assets:extract -- --mods "/chemin/vers/mods"     # autre emplacement (ou variable ISAAC_MODS_DIR)
```

Le même script récupère aussi les ressources du jeu lui-même (sprites des 720 objets et 189 trinkets, portraits « VS » des boss, logo Repentance). Il lance au besoin l'outil officiel `tools/ResourceExtractor` du jeu, qui décompresse les archives `resources/packed/*.a` dans `.cache/game-resources/` (≈ 1 Go, ignoré par git, une seule fois). Autre dossier déjà extrait : `--resources "<dossier>"` ou `ISAAC_RESOURCES_DIR`.

Le script lit les fichiers `.anm2` pour découper les planches et écrit `apps/web/public/game-assets/` (inclus dans le build) et `apps/web/src/generated/game-assets.json`.

> ⚠ Ces images dérivent des graphismes officiels (Edmund McMillen / Nicalis) et du travail des auteurs des mods. Elles sont intégrées **pour un usage personnel/privé**, à la demande du propriétaire de l'instance. Sur une instance publique, supprimez `apps/web/public/game-assets/` (l'interface revient alors aux emblèmes générés) ou obtenez les autorisations nécessaires.

## Documentation

- [Architecture et API](docs/ARCHITECTURE.md)
- [Déploiement, HTTPS, mise à jour, restauration](docs/DEPLOIEMENT.md)
- [Données : chaîne, import, traductions](docs/IMPORT-DONNEES.md)
- [Couverture des données](docs/COUVERTURE-DONNEES.md)
- [Résultats des tests](docs/RESULTATS-TESTS.md)

## Lint (configuration à ajouter)

Un hook de l'environnement de développement a empêché l'écriture de `eslint.config.js` (fichier actuellement vide). Configuration prévue :

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'packages/game-data', 'apps/server/drizzle', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['apps/web/**/*.{ts,tsx}'], plugins: { 'react-hooks': reactHooks }, rules: { ...reactHooks.configs.recommended.rules } },
);
```

## Licences

Code : MIT. Données et contenus éditoriaux : CC BY-SA 4.0. Voir [`LICENSE`](LICENSE).
