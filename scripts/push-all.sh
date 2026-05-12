#!/bin/bash
# push-all.sh — Push all changes to GitHub
# Ejecutar después de completar todo el trabajo de la sesión
# Requiere: GitHub auth (gh CLI o token)

set -e

echo "📤 Pushing cambios a GitHub..."
echo ""

# Verificar que estamos en main
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "❌ No estamos en main (estamos en $BRANCH). Cambiar a main primero."
  exit 1
fi

# Verificar que hay commits nuevos
AHEAD=$(git log origin/main..HEAD --oneline | wc -l)
if [ "$AHEAD" -eq 0 ]; then
  echo "✅ No hay commits nuevos para push."
  exit 0
fi

echo "📋 Commits a pushear ($AHEAD):"
git log origin/main..HEAD --oneline
echo ""

# Push
echo "🚀 Pushing..."
git push origin main
echo ""
echo "✅ Push completado. $AHEAD commits subidos a GitHub."
echo ""
echo "🔗 Verificar: https://github.com/pabloeckert/MejoraContactos"
echo "🔗 Live: https://pabloeckert.github.io/MejoraContactos/"
