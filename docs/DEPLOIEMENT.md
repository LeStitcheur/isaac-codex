# Déploiement d'Isaac Codex

## Prérequis

- Node.js **22 LTS** (ou plus récent) et npm.
- Aucun service externe : SQLite est embarqué, les données du jeu sont incluses dans le dépôt.
- Un seul port HTTP.

## Commandes

```bash
npm install          # ou « npm ci » pour respecter strictement package-lock.json
npm run build        # compile le frontend (dist/web) et le backend (dist/server)
npm start            # migrations + import des données si nécessaire + serveur
```

Variables d'environnement : voir [`.env.example`](../.env.example). Le port est lu dans `PORT`, sinon `SERVER_PORT`, sinon 8080.

`scripts/install.sh` (installation complète) et `scripts/start.sh` (démarrage avec réinstallation/recompilation automatiques) fonctionnent sur tout Linux.

## Pterodactyl (VPS Contabo ou autre)

Voir [`pterodactyl/README.md`](../pterodactyl/README.md).

## HTTPS via reverse proxy (sur l'hôte, hors conteneur)

Aucun certificat n'est inclus dans l'application. Exemple **Caddy** (certificat Let's Encrypt automatique) :

```caddyfile
codex.example.fr {
    encode zstd gzip
    reverse_proxy 127.0.0.1:25565   # IP:port de l'allocation Pterodactyl
}
```

Exemple **Nginx** + Certbot :

```nginx
server {
    listen 80;
    server_name codex.example.fr;
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name codex.example.fr;
    ssl_certificate     /etc/letsencrypt/live/codex.example.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/codex.example.fr/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;
    client_max_body_size 4m;
    location / {
        proxy_pass http://127.0.0.1:25565;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Obtenir le certificat : `sudo certbot --nginx -d codex.example.fr`. Si l'allocation Pterodactyl écoute sur l'IP publique du node, restreignez l'accès direct au port par pare-feu (`ufw`) pour forcer le passage par HTTPS.

## Sécurité en production

- Profils : jeton aléatoire de 256 bits par appareil (seul son SHA-256 est stocké), mot de passe facultatif haché avec scrypt. L'identifiant de profil n'est pas un secret : sans jeton valide, l'API répond 401/404.
- Instance publique : laissez `ALLOW_PROFILE_CREATION=true` pour permettre aux visiteurs de suivre leur progression, ou `false` pour une consultation seule. `AUTH_RATE_LIMIT_MAX` limite créations/connexions/imports (10 par IP et par 15 min par défaut) ; `RATE_LIMIT_MAX` limite l'ensemble des requêtes.
- En-têtes HTTP de sécurité (CSP stricte, nosniff, frame-ancestors none…) ; HSTS est à configurer sur le reverse proxy.

## Mise à jour

1. Faites une sauvegarde : `npm run db:backup` (ou copiez `data/`).
2. Remplacez les fichiers du projet **sans toucher à `data/`**.
3. `npm ci && npm run build && npm start` (ou redémarrez le serveur Pterodactyl : `start.sh` s'en charge).
4. Les migrations s'appliquent automatiquement ; les données du jeu sont réimportées si leur version a changé. **Les profils ne sont jamais modifiés par cette réimportation.**

## Sauvegarde et restauration

- Sauvegarde manuelle à chaud : `npm run db:backup` → `data/backups/isaac-codex-AAAAMMJJ-HHMMSS.sqlite` (API backup de SQLite, cohérente pendant le fonctionnement).
- Sauvegarde automatique au démarrage (au plus toutes les 12 h, 7 fichiers conservés).
- Export individuel d'un profil : page **Profil → Exporter en JSON**.

Restauration :

1. Arrêtez le serveur.
2. Mettez de côté les fichiers actuels : `data/isaac-codex.sqlite`, `-wal`, `-shm` (renommez-les, ne les supprimez pas).
3. Copiez la sauvegarde choisie en `data/isaac-codex.sqlite`.
4. Redémarrez.

## Santé

`GET /api/health` → `{"status":"ok","db":"ok","datasetVersion":…}` (code 503 si la base est inaccessible). Non soumis à la limitation de débit.
