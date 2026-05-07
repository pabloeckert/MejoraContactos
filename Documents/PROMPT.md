# 🤖 Prompt de Continuidad — MejoraContactos

> **Instrucción:** Cuando inicies una sesión y el usuario mencione "MejoraContactos", leé este archivo primero para retomar contexto completo.

## ¿Qué es esto?

Sos el asistente de desarrollo del proyecto **MejoraContactos** — una app web para limpiar, deduplicar y unificar bases de contactos con IA.

**Repo:** https://github.com/pabloeckert/MejoraContactos
**Live:** https://util.mejoraok.com/mejoracontactos/
**Documentación completa:** `Documents/MASTERPLAN.md` (archivo único)

## Contexto rápido

- **Stack:** React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui + Supabase Edge Functions
- **12 proveedores de IA** con rotación automática de keys
- **Pipeline:** Parseo → Mapeo → Reglas (80%) → IA Limpieza → IA Verificación → IA Corrección → Validación → Dedup
- **Deploy:** Push a `main` → GitHub Actions → build + test → SCP a Hostinger (automático)
- **Edge Functions:** Se deployan manualmente con Supabase CLI
- **Tests:** 219 unit + 21 E2E
- **Bundle:** ~305KB index (lazy xlsx, phone-lib, papaparse, sentry en chunks separados)

## Estado actual (v12.8 — 2026-05-05)

- ✅ Core completo (pipeline IA, dedup, exportación 10+ formatos, Google Contacts)
- ✅ Deploy funcional en producción
- ✅ 12 proveedores IA configurados con rotación automática
- ✅ Health Check de proveedores
- ✅ Historial/Undo con snapshots (TTL 30 días)
- ✅ 219 unit + 21 E2E tests pasando
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

## Pendientes principales

| # | Tarea | Prioridad |
|---|-------|-----------|
| 1 | Ejecutar migraciones SQL en Supabase Dashboard | 🟡 Alta |
| 2 | Deploy Edge Functions actualizadas | 🟡 Alta |
| 3 | Sentry DSN en producción | 🟢 Media |
| 4 | Cloudflare CDN | 🟢 Media |

## Comandos útiles

```bash
cd MejoraContactos && npm install --legacy-peer-deps && npm run dev
npx vitest run
npx vite build
git push origin main
npx supabase functions deploy clean-contacts
```

## Convenciones

- **"documentar":** Actualiza `Documents/MASTERPLAN.md` con el estado actual
- **Commits:** `tipo: descripción` (feat, fix, docs, chore, ci, perf)
- **NO commitear:** `.env`, tokens, API keys
- **Tests:** Cada feature nuevo debe tener tests
- **Bundle budget:** < 450KB index, < 2MB total

---

*Prompt de continuidad — actualizar con cada sesión.*
*Última actualización: 2026-05-07 — v12.8*
