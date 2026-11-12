# Isaac Codex sur Pterodactyl

Egg : [`egg-isaac-codex.json`](egg-isaac-codex.json) — format **PTDL_v2** (Pterodactyl Panel 1.x).

## 1. Importer l'egg

1. Panel → **Admin → Nests** → créez un nest (ex. « Applications web ») ou utilisez-en un existant.
2. **Import Egg** → sélectionnez `egg-isaac-codex.json` → choisissez le nest → *Import*.
3. Vérifiez dans l'onglet *Variables* que les 11 variables sont présentes.

## 2. Créer le serveur

| Réglage | Valeur conseillée |
|---|---|
| Egg | Isaac Codex - Node.js |
| Image Docker | `ghcr.io/parkervcp/yolks:nodejs_22` (amd64 et arm64) |
| Mémoire | 512 Mo minimum (1 Go confortable pendant la compilation) |
| Disque | 1,5 Go (node_modules + build + base) |
| Allocation | n'importe quel port libre : il est transmis via `SERVER_PORT` |

Laissez **PORT vide** : le serveur utilise automatiquement le port attribué (`SERVER_PORT`). Aucun port n'est imposé.

## 3. Déployer le code

**Option A — SFTP / gestionnaire de fichiers (recommandé)**

1. Sur votre machine : téléchargez ou clonez le projet (sans `node_modules`, `dist` ni `data`).
2. Envoyez tout le contenu à la racine du serveur (`/home/container`) via SFTP (identifiants : onglet *Settings* du serveur, port SFTP 2022 par défaut) ou via le gestionnaire de fichiers (archive `.zip` puis *Unarchive*).
3. Démarrez le serveur. Au premier démarrage, `scripts/start.sh` exécute `npm ci`, compile (`npm run build`), applique les migrations, importe les données puis lance l'application. La console affiche `Isaac Codex listening on http://0.0.0.0:<port>` : le panel passe alors le serveur à l'état *Running*.

**Option B — dépôt Git**

Renseignez la variable `GIT_REPO` (et `GIT_BRANCH`), puis **Settings → Reinstall Server**. Le script d'installation clone le dépôt et exécute `scripts/install.sh` dans un conteneur `node:22-bookworm` (outils de compilation inclus, utiles si `better-sqlite3` doit être compilé).

## 4. Fonctionnement

- **Démarrage** : `bash scripts/start.sh` → `exec node dist/server/index.js` (Node au premier plan, signaux transmis directement).
- **Arrêt** : `^C` (SIGINT). Le serveur ferme les connexions, effectue un checkpoint WAL et ferme SQLite proprement.
- **Prêt** : chaîne détectée `Isaac Codex listening`.
- **Persistance** : base `data/isaac-codex.sqlite` (+ `-wal`/`-shm`), sauvegardes `data/backups/`, sprites `data/sprites/`. Rien dans `data/` n'est jamais supprimé par les scripts.
- **Sauvegarde automatique** : au démarrage, au plus une toutes les 12 h, 7 conservées (`BACKUP_ON_START`, `BACKUP_KEEP`).
- **Mise à jour** : envoyez les nouveaux fichiers (sans écraser `data/`), puis redémarrez. `start.sh` relance `npm ci` si `package-lock.json` a changé et recompile si les sources sont plus récentes que la compilation.
- **Aucun paquet système** n'est installé au runtime. `better-sqlite3` utilise des binaires précompilés (Linux glibc x64/arm64) téléchargés par `npm ci` ; en leur absence, la compilation nécessite les outils présents dans le conteneur d'installation : utilisez alors **Reinstall Server** (option B ou code déjà présent) plutôt qu'un simple redémarrage.

## 5. HTTPS

Pterodactyl expose le port en HTTP. Placez un reverse proxy HTTPS (Nginx, Caddy, Traefik) **sur l'hôte**, devant `IP_DU_NODE:PORT_ALLOUÉ`. Exemples dans [`docs/DEPLOIEMENT.md`](../docs/DEPLOIEMENT.md). Gardez `TRUST_PROXY=true`.

## 6. Différences entre versions du panel

- **Pterodactyl Panel 1.x** : format `PTDL_v2` pris en charge nativement (format utilisé ici).
- **Panel 0.7 (obsolète)** : format `PTDL_v1`, non pris en charge par cet egg.
- **Pelican Panel** (fork) : il annonce l'import des eggs Pterodactyl `PTDL_v2` et les convertit. *Non testé dans le cadre de ce projet.*
- La validation de l'egg a été faite par un script (champs requis, sous-champs `config.*` en JSON valide, variables complètes, syntaxe bash) ; **l'import dans un panel réel n'a pas pu être testé ici**.

## 7. Dépannage

| Symptôme | Cause probable / solution |
|---|---|
| Le serveur reste en *Starting* | La chaîne `Isaac Codex listening` n'est pas apparue : consultez la console (erreur de compilation, mémoire insuffisante). |
| `Port invalide` | `PORT` contient une valeur non numérique : videz la variable. |
| `Jeu de données introuvable` | Le dossier `packages/game-data/generated/` n'a pas été envoyé. |
| Erreur `better-sqlite3` / `invalid ELF header` | `node_modules` a été copié depuis Windows/macOS : supprimez `node_modules` et redémarrez (ou réinstallez). |
| Mémoire dépassée pendant `npm run build` | Augmentez temporairement la mémoire à 1 Go. |
