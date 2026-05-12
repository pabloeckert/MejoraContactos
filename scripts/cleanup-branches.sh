#!/bin/bash
# cleanup-branches.sh — Ejecutar después de hacer push de los cambios de docs
# Limpia branches remote obsoletas del repo
# Requiere: GitHub auth (gh CLI o token)

set -e

echo "🧹 Limpiando branches remote obsoletas..."
echo ""

# Staging — desactualizada, restaura Hostinger, borra tests
echo "❌ Eliminando staging (desactualizada, código viejo de Hostinger)..."
git push origin --delete staging 2>/dev/null && echo "  ✅ staging eliminada" || echo "  ⚠️ staging no existe o sin permisos"

# Dependabot branches — evaluados, no mergear
branches=(
  "dependabot/npm_and_yarn/eslint-plugin-react-refresh-0.5.2"
  "dependabot/npm_and_yarn/sonner-2.0.7"
  "dependabot/npm_and_yarn/tailwind-merge-3.5.0"
  "dependabot/npm_and_yarn/tailwindcss-4.2.4"
  "dependabot/npm_and_yarn/typescript-6.0.3"
)

for branch in "${branches[@]}"; do
  echo "❌ Eliminando $branch..."
  git push origin --delete "$branch" 2>/dev/null && echo "  ✅ $branch eliminada" || echo "  ⚠️ $branch no existe o sin permisos"
done

echo ""
echo "✅ Limpieza completada."
echo ""
echo "Alternativa: Cerrar los PRs de dependabot desde GitHub UI"
echo "https://github.com/pabloeckert/MejoraContactos/pulls"
