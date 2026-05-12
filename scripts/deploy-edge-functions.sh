#!/bin/bash
# deploy-edge-functions.sh — Deploy Edge Functions actualizadas a Supabase
# Requiere: Supabase CLI autenticado (npx supabase login)

set -e

echo "🚀 Deploying Edge Functions a Supabase..."
echo ""

# Verificar autenticación
if ! npx supabase projects list >/dev/null 2>&1; then
  echo "❌ No autenticado. Ejecutar: npx supabase login"
  exit 1
fi

echo "📦 Deploying clean-contacts..."
npx supabase functions deploy clean-contacts
echo "  ✅ clean-contacts deployed"
echo ""

echo "📦 Deploying google-contacts-auth..."
npx supabase functions deploy google-contacts-auth
echo "  ✅ google-contacts-auth deployed"
echo ""

echo "📦 Deploying log-error..."
npx supabase functions deploy log-error
echo "  ✅ log-error deployed"
echo ""

echo "✅ Todas las Edge Functions deployeadas."
echo ""
echo "⚠️  Recordar: Las migraciones SQL se ejecutan manualmente en Supabase Dashboard"
echo "   → SQL Editor → pegar contenido de:"
echo "   → supabase/migrations/20260429_rate_limits.sql"
echo "   → supabase/migrations/20260502_rate_limit_check.sql"
