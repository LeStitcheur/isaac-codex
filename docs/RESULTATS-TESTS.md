# Résultats des tests

Exécutés le 2026-11-08 sur Windows 11, Node.js 24.18 (le projet cible Node 22 LTS ; aucune API spécifique à Node 24 n'est utilisée).

## Vérifications automatiques

| Commande | Résultat |
|---|---|
| `npm ci` (via `scripts/start.sh`) | ✅ 499 paquets installés depuis `package-lock.json` |
| `npm run typecheck` (TypeScript strict, serveur + web) | ✅ aucune erreur |
| `npm run build` | ✅ frontend (code découpé par page) + serveur (`dist/server/index.js`) |
| `npm test` (Vitest) | ✅ **49 tests / 4 fichiers** |
| `npm run test:e2e` (Playwright, Chromium desktop + Pixel 7) | ✅ **14 tests** (7 parcours × 2 formats) |
| `npm run lint` | ⚠️ **non exécuté** : la configuration ESLint n'a pas pu être écrite (voir ci-dessous) |

### Vitest (49)

- `tests/unit/wikitext.test.ts` (10) : conversion wikitext et chaînes Cargo, table des codes de version, balisage, slugs, libellés de versions.
- `tests/unit/logic.test.ts` (15) : volumes et faits de référence du jeu de données ; 13 déblocages de marques par personnage normal, 7 par Tainted ; déduction des succès depuis les marques (mode difficile, marques combinées des Tainted) ; paliers de dons ; statut manuel prioritaire ; prérequis ; statistiques ; planificateur (objectifs disponibles uniquement, avertissement « hasard ») ; parcours ; simulateur (modificateurs simples, conditionnels exclus, filtrage par version, transformations, synergies uniquement documentées).
- `tests/data/import.test.ts` (5) : CSV (BOM, « ; », guillemets), validation ligne par ligne, déduplication, JSON ; validation des exports de profil.
- `tests/api/api.test.ts` (19) : migrations (tables, idempotence, clés étrangères) ; santé ; recherche avec faute de frappe, nom français, identifiant ; filtres et pagination ; 404/400 ; fiches ; paliers de dons ; comparaison et simulateur ; en-têtes de sécurité ; **sécurité des profils** (401 sans jeton, 404 avec le jeton d'un autre profil, jeton stocké haché, noms uniques, validation des entrées) ; marque → déblocage → statistiques → recommandations ; export/import ; mot de passe et reconnexion ; **persistance après redémarrage** ; profils conservés lors d'une réimportation forcée des données.

### Playwright (14)

Rechercher un objet avec une faute de frappe et ouvrir sa fiche · consulter un personnage, voir ses déblocages, valider une marque (normal puis difficile, persistance après rechargement) · filtrer les objets · saisir des dons et voir le calcul de progression · simulateur de build · export puis import d'un profil · planificateur et parcours.

## Vérifications manuelles

- Application compilée lancée avec `npm start` puis avec `bash scripts/start.sh` (`PORT` vide, `SERVER_PORT` fourni, base neuve) : migrations, import, écoute sur le port attribué ✅.
- Navigation visuelle (desktop et 390 px) : accueil, fiche personnage, fiche objet ; aucune erreur dans la console ✅.
- `npm run db:backup` ✅ ; `npm run data:import` (CSV avec lignes valides, inconnues et invalides) ✅.
- Egg Pterodactyl : structure PTDL_v2 validée par script (champs requis, `config.*` en JSON valide, 11 variables complètes) et syntaxe bash des scripts d'installation et de démarrage (`bash -n`) ✅.

## Non vérifié

- **Import de l'egg dans un vrai panel Pterodactyl et exécution dans un conteneur Linux** : aucun panel n'était disponible. Le comportement de `^C` (SIGINT → arrêt propre) est implémenté mais n'a pas été observé dans un conteneur.
- **Déploiement sur le VPS Contabo** : non effectué.
- **Lint ESLint** : un hook de protection des configurations (plugin ECC installé dans l'environnement de développement) a bloqué l'écriture de `eslint.config.js`. Le fichier est vide ; la configuration prévue est indiquée dans le README.
- Exécution sous Node 22 exactement (tests effectués sous Node 24).
