# 🤖 Prompt de Continuidad — MejoraContactos

> **Instrucción:** Cuando inicies una sesión y el usuario mencione "MejoraContactos" o "continuemos", leé este archivo primero para retomar contexto completo.

## ¿Qué es esto?

Sos el asistente de desarrollo del proyecto **MejoraContactos** — una app web para limpiar, deduplicar y unificar bases de contactos con IA.

**Repo:** https://github.com/pabloeckert/MejoraContactos
**Live:** https://pabloeckert.github.io/MejoraContactos/
**Documentación completa:** `Documents/MASTERPLAN.md` (archivo único)
**Resumen de sesión:** `Documents/SESSION_RESUME.md` (leer para retomar)

## Contexto rápido

- **Stack:** React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui + Supabase Edge Functions
- **12 proveedores de IA** con rotación automática de keys
- **Pipeline:** Parseo → Mapeo → Reglas (80%) → IA Limpieza → IA Verificación → IA Corrección → Validación → Dedup
- **Deploy:** Push a `main` → GitHub Actions → build + test → GitHub Pages (automático)
- **Edge Functions:** Se deployan manualmente con Supabase CLI
- **Tests:** 326 unit + 21 E2E
- **Bundle:** ~298KB index (lazy xlsx, phone-lib, papaparse, sentry en chunks separados)

## Estado actual (v12.9 — 2026-05-13)

- ✅ Core completo (pipeline IA, dedup, exportación 10+ formatos, Google Contacts)
- ✅ Deploy funcional en GitHub Pages
- ✅ 12 proveedores IA configurados con rotación automática
- ✅ Health Check de proveedores
- ✅ Historial/Undo con snapshots (TTL 30 días)
- ✅ 326 unit + 21 E2E tests pasando
- ✅ PWA installable
- ✅ Landing page + SEO (OG tags, Schema.org)
- ✅ Onboarding wizard + modo simple/avanzado
- ✅ CSP headers + JWT auth + input validation + AES-GCM
- ✅ Privacy Policy + Terms of Service + Cookie consent
- ✅ Unified Error Handling (8 categorías, 4 severidades)
- ✅ Sentry integration (lazy-loaded, optional)
- ✅ ErrorBoundaries granulares por sección
- ✅ CRM exports (Google, HubSpot, Salesforce, Zoho, Airtable)
- ✅ Google Contacts delete + refresh token
- ✅ Rate limiting DB-backed + L1 cache
- ✅ GDPR completo
- ✅ Supabase client lazy init (getSupabase)
- ✅ CTO Audit completa (CTO_AUDIT.md)
- ✅ Migración completa a GitHub Pages
- ✅ CHANGELOG.md con historial completo

## Pendientes principales

| # | Tarea | Prioridad | Detalle |
|---|-------|-----------|---------|
| 1 | Ejecutar migraciones SQL en Supabase | 🔴 Alta | `20260429_rate_limits.sql` y `20260502_rate_limit_check.sql` |
| 2 | Deploy Edge Functions actualizadas | 🔴 Alta | `npx supabase functions deploy google-contacts-auth` |
| 3 | Eliminar branches remote obsoletas | 🟡 Media | `staging` + 5 dependabot (ver SESSION_RESUME.md) |
| 4 | Sentry DSN en producción | 🟢 Media | Crear proyecto en sentry.io |
| 5 | useReducer refactor | 🟢 Media | Hook useContactProcessing (~150 líneas) |
| 6 | E2E Google Contacts | 🟢 Media | Flujo OAuth completo sin tests E2E |

## Comandos útiles

```bash
cd MejoraContactos && npm install --legacy-peer-deps && npm run dev
npx vitest run
npx vite build
git push origin main
npx supabase functions deploy clean-contacts
npx supabase functions deploy google-contacts-auth
```

## Convenciones

- **"documentar":** Actualiza `Documents/MASTERPLAN.md` con el estado actual
- **Commits:** `tipo: descripción` (feat, fix, docs, chore, ci, perf)
- **NO commitear:** `.env`, tokens, API keys
- **Tests:** Cada feature nuevo debe tener tests
- **Bundle budget:** < 450KB index, < 2MB total

---

*Prompt de continuidad — actualizar con cada sesión.*
*Última actualización: 2026-05-13 — v12.9 — 326 tests*
