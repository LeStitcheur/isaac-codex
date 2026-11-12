#!/bin/bash
# Isaac Codex — démarrage (utilisé par l'egg Pterodactyl, utilisable partout).
# - Réinstalle les dépendances si package-lock.json a changé (mise à jour par SFTP).
# - Recompile si la compilation manque ou si les sources sont plus récentes.
# - Lance Node en avant-plan via exec : les signaux d'arrêt (SIGINT/SIGTERM) l'atteignent directement.
set -euo pipefail
cd "$(dirname "$0")/.."

export NODE_ENV="${NODE_ENV:-production}"
export HOST="${HOST:-0.0.0.0}"
# Pterodactyl fournit le port attribué dans SERVER_PORT ; PORT peut le surcharger s'il est renseigné.
if [ -z "${PORT:-}" ] && [ -n "${SERVER_PORT:-}" ]; then
  export PORT="$SERVER_PORT"
fi
mkdir -p data

stamp="node_modules/.isaac-codex-lock.sha"
lockhash="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$lockhash" ]; then
  echo "[start] Dépendances absentes ou modifiées : npm ci…"
  npm ci --include=dev --no-audit --no-fund
  echo "$lockhash" > "$stamp"
fi

if [ ! -f dist/server/index.js ] || [ ! -f dist/web/index.html ] \
  || [ -n "$(find apps packages/shared/src packages/game-data/generated -type f -newer dist/server/index.js -print -quit 2>/dev/null)" ]; then
  echo "[start] Compilation nécessaire : npm run build…"
  npm run build
fi

echo "[start] Lancement d'Isaac Codex sur ${HOST}:${PORT:-8080}"
exec node dist/server/index.js
