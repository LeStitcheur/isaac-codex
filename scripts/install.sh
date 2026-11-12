#!/bin/bash
# Isaac Codex — installation / mise à jour (idempotent, ne touche jamais au dossier data/).
#   1. installe les dépendances verrouillées (package-lock.json)
#   2. compile le frontend et le backend
#   3. applique les migrations SQLite et importe les données du jeu
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[install] Node $(node --version) / npm $(npm --version) — dossier $(pwd)"
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  echo "[install] ERREUR : Node.js 22 ou plus récent est requis." >&2
  exit 1
fi

mkdir -p data

echo "[install] Installation des dépendances (npm ci)…"
# Les dépendances de développement sont nécessaires à la compilation (Vite, tsup, TypeScript).
npm ci --include=dev --no-audit --no-fund
sha256sum package-lock.json | cut -d' ' -f1 > node_modules/.isaac-codex-lock.sha

echo "[install] Compilation…"
npm run build

echo "[install] Migrations et import des données…"
node dist/server/index.js --migrate-only

echo "[install] Terminé. Démarrage : bash scripts/start.sh"
