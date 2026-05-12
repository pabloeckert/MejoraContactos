#!/bin/bash
# quick-connect.sh — Restaura autenticación de GitHub al inicio de sesión
# Ejecutar al inicio de cada sesión CTO: bash scripts/quick-connect.sh
# No requiere input del usuario si el token ya está guardado.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CRED_FILE="$HOME/.openclaw/credentials/github-mejoracontactos.token"

# 1. Verificar token
if [ ! -f "$CRED_FILE" ]; then
  echo "NO_TOKEN"
  exit 1
fi

TOKEN=$(cat "$CRED_FILE" | tr -d '[:space:]')
if [ -z "$TOKEN" ]; then
  echo "EMPTY_TOKEN"
  exit 1
fi

# 2. Configurar remote
cd "$REPO_DIR"
git remote set-url origin "https://x-access-token:${TOKEN}@github.com/pabloeckert/MejoraContactos.git" 2>/dev/null

# 3. Fetch latest
git fetch origin --prune 2>/dev/null

# 4. Status
AHEAD=$(git log origin/main..HEAD --oneline 2>/dev/null | wc -l)
BEHIND=$(git log HEAD..origin/main --oneline 2>/dev/null | wc -l)
BRANCH=$(git branch --show-current)

echo "CONNECTED"
echo "BRANCH=$BRANCH"
echo "AHEAD=$AHEAD"
echo "BEHIND=$BEHIND"
echo "REMOTE_BRANCHES=$(git branch -r | grep -v HEAD | wc -l)"
