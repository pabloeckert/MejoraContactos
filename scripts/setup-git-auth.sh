#!/bin/bash
# setup-git-auth.sh — Configura autenticación de GitHub para el repo MejoraContactos
# Ejecutar una sola vez por máquina. El token se almacena en ~/.openclaw/credentials/
# Uso: bash scripts/setup-git-auth.sh

set -e

CRED_FILE="$HOME/.openclaw/credentials/github-mejoracontactos.token"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$CRED_FILE" ]; then
  echo "❌ No se encontró el token en $CRED_FILE"
  echo "   Crear el archivo con el token (una línea, sin espacios):"
  echo "   echo 'ghp_XXXX' > $CRED_FILE"
  echo "   chmod 600 $CRED_FILE"
  exit 1
fi

TOKEN=$(cat "$CRED_FILE" | tr -d '[:space:]')

if [ -z "$TOKEN" ]; then
  echo "❌ Token vacío en $CRED_FILE"
  exit 1
fi

# Configurar remote con token
cd "$REPO_DIR"
git remote set-url origin "https://x-access-token:${TOKEN}@github.com/pabloeckert/MejoraContactos.git"

echo "✅ Git auth configurado para MejoraContactos"
echo "   Remote: origin → github.com/pabloeckert/MejoraContactos"
echo "   Token: ${TOKEN:0:4}...${TOKEN: -4} (oculto)"
