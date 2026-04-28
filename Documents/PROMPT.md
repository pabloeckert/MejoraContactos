# 🤖 Prompt de Continuidad — MejoraContactos

> **Instrucción:** Cuando inicies una sesión y el usuario mencione "MejoraContactos", leé este archivo primero para retomar contexto completo.

## ¿Qué es esto?

Sos el asistente de desarrollo del proyecto **MejoraContactos** — una app web para limpiar, deduplicar y unificar bases de contactos con IA.

**Repo:** https://github.com/pabloeckert/MejoraContactos
**Live:** https://util.mejoraok.com/mejoracontactos/
**Documentación completa:** `Documents/MASTERPLAN.md` (archivo único)

## Contexto rápido

- **Stack:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Supabase Edge Functions
- **12 proveedores de IA** con rotación automática de keys
- **Pipeline:** Parseo → Mapeo → Reglas (80%) → IA Limpieza → IA Verificación → IA Corrección → Validación → Dedup
- **Deploy:** Push a `main` → GitHub Actions → build + test → SCP a Hostinger (automático)
- **Edge Functions:** Se deployan manualmente con Supabase CLI
- **Tests:** 174 tests, `npx vitest run`
- **Bundle:** ~389KB index (lazy xlsx, chunks separados)

## Estado actual (v10.6 — 2026-04-29)

- ✅ Core completo (pipeline IA, dedup, exportación 6 formatos, Google Contacts)
- ✅ Deploy funcional en producción
- ✅ 12 proveedores IA configurados (Groq y Cerebras verificados)
- ✅ Health Check de proveedores
- ✅ Historial/Undo con snapshots
- ✅ 174 tests pasando
- ✅ PWA (manifest + service worker)
- ✅ Landing page + SEO (OG tags, Schema.org)
- ✅ i18n (ES/EN/PT)
- ✅ Onboarding wizard + modo simple/avanzado
- ✅ CSP headers + JWT auth + input validation
- ✅ Privacy Policy + Terms of Service
- ✅ Error Reporter v2 (unhandled errors + webhook + Edge Function)
- ✅ Health endpoint (health.json)
- ✅ Uptime monitoring (cron cada 5 min)
- ✅ CSV encoding fix (UTF-8 + BOM)
- ✅ Regex column mapper robusto
- ✅ Keyboard shortcuts (1-6, D, S, ?)
- ✅ SimpleMode fix (ProcessingPanel integrado)
- ✅ Fix: declaración duplicada en Edge Function clean-contacts

## Pendientes principales (Etapa 12)

| # | Tarea | Rol | Prioridad |
|---|-------|-----|-----------|
| 1 | Dividir useContactProcessing (407→3 hooks) | Software Architect | 🔴 Alta |
| 2 | Sentry para errores de producción | SRE | 🔴 Alta |
| 3 | Rate limit en Supabase DB | Backend Dev | 🟡 Alta |
| 4 | Playwright E2E en GitHub Actions | QA Automation | 🟡 Alta |
| 5 | Cloudflare CDN (gratis) | Cloud Architect | 🟡 Alta |
| 6 | Encriptar API keys (Web Crypto API) | Cybersecurity | 🟡 Alta |
| 7 | 3er proveedor IA verificado | Backend Dev | 🟡 Alta |

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
- **Git config:** `MejoraContactos Bot <bot@mejoraok.com>`
- **NO commitear:** `.env`, tokens, API keys

## Lo que NO hacer

- ❌ No instalar dependencias nuevas sin preguntar
- ❌ No commitear .env ni tokens
- ❌ No hacer deploy manual de frontend (es automático con push)
- ❌ No tocar Edge Functions sin preguntar (deploy manual)

---

*Prompt de continuidad — actualizar con cada sesión.*
