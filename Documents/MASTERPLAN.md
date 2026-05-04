# 📋 MejoraContactos — Documento Maestro

> **⚡ INSTRUCCIÓN:** Cuando el usuario diga **"documentar"**, actualizar este archivo con el estado actual del proyecto, trabajos realizados, pendientes y cualquier cambio relevante. Todos los documentos viven en `Documents/`.

**Última actualización:** 2026-05-05 04:11 GMT+8
**Versión actual:** v12.8
**Repo:** [pabloeckert/MejoraContactos](https://github.com/pabloeckert/MejoraContactos)
**Live:** https://util.mejoraok.com/mejoracontactos/
**Tests:** 219 pasando ✅ | E2E: 21 pasando ✅ | Build: 305KB index ✅ | Lint: 0 errores ✅

---

## Tabla de Contenidos

1. [Visión Ejecutiva](#1-visión-ejecutiva)
2. [Stack y Arquitectura](#2-stack-y-arquitectura)
3. [Funcionalidades](#3-funcionalidades)
4. [Pipeline de Procesamiento](#4-pipeline-de-procesamiento)
5. [Proveedores IA](#5-proveedores-ia)
6. [Importación y Exportación](#6-importación-y-exportación)
7. [Google Contacts — Flujo Completo](#7-google-contacts--flujo-completo)
8. [Análisis Multidisciplinario](#8-análisis-multidisciplinario)
9. [Historial de Sesiones](#9-historial-de-sesiones)
10. [Infraestructura y Deploy](#10-infraestructura-y-deploy)
11. [Seguridad](#11-seguridad)
12. [Pendientes y Próximos Pasos](#12-pendientes-y-próximos-pasos)
13. [Archivos Clave](#13-archivos-clave)
14. [Comandos Rápidos](#14-comandos-rápidos)
15. [Convenciones](#15-convenciones)

---

## 1. Visión Ejecutiva

MejoraContactos es una SPA para limpiar, deduplicar y unificar contactos desde múltiples fuentes (CSV, Excel, VCF, JSON, Google Contacts) usando un pipeline híbrido: reglas determinísticas (80%+) + IA con 12 proveedores y rotación automática.

**Estado actual:** ✅ BETA — Funcional y en producción

**Diferenciadores clave:**
- 12 proveedores IA con rotación automática y retry con backoff exponencial
- Pipeline híbrido: reglas (80%) + IA (20%) = rápido + inteligente
- Gratuito (el usuario paga solo la API que usa)
- Privacy-first: todo procesa en el browser del usuario
- Multi-formato: 5 formatos de entrada, 10+ de salida (incluyendo CRM)
- Borrado masivo de Google Contacts con confirmación de seguridad
- API keys cifradas con AES-GCM en localStorage
- GDPR compliant: privacy policy, terms, cookie consent, data retention

**Caso de uso principal:**
1. Exportar todos los contactos de Google Contacts
2. Limpiar, deduplicar y validar con IA
3. Borrar los contactos sucios de Google
4. Re-importar el archivo limpio

---

## 2. Stack y Arquitectura

### Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite 5 + TypeScript |
| UI | Tailwind CSS + shadcn/ui (Radix) |
| Persistencia local | IndexedDB via `idb` (TTL 30 días) |
| Backend (IA) | Supabase Edge Functions (Deno nativo) |
| Telefónica | `libphonenumber-js` (E.164, lazy-loaded) |
| Parsing | PapaParse (CSV, lazy), SheetJS (Excel, lazy), parser propio (VCF) |
| Virtualización | `@tanstack/react-virtual` |
| Temas | `next-themes` (dark/light) |
| Error tracking | Sentry (lazy-loaded, optional) |
| Deploy frontend | GitHub Actions → SSH+SCP → Hostinger |
| Deploy Edge Functions | Supabase CLI |
| Supabase project | `tzatuvxatsduuslxqdtm` |
| Analytics | Plausible (GDPR-safe) + localStorage events |

### Arquitectura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   GitHub        │────▶│  GitHub Actions   │────▶│  Hostinger VPS  │
│   (source)      │     │  (CI/CD + E2E)    │     │  (SSH/SCP)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘

┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Browser        │────▶│  Supabase Edge   │────▶│  12 AI Providers│
│  (React SPA)    │     │  Functions (Deno)│     │  (rotación auto)│
│  (IndexedDB)    │     └──────────────────┘     └─────────────────┘
│  (Web Workers)  │
└─────────────────┘
```

### Bundle Production (v12.8)

| Chunk | Tamaño | gzip |
|-------|--------|------|
| index (main) | 305 KB | 87 KB |
| xlsx | 429 KB | 143 KB |
| phone-lib | 183 KB | 45 KB |
| supabase | 194 KB | 51 KB |
| router | 155 KB | 51 KB |
| ui | 96 KB | 32 KB |
| **Total JS** | **1.56 MB** | — |

---

## 3. Funcionalidades

### ✅ Funcional (sin configurar nada)
- **Importación:** CSV, Excel, VCF, JSON
- **Mapeo automático** de columnas (ES/EN)
- **Limpieza por reglas** determinísticas (80%+)
- **Deduplicación** O(n) con hash + Jaro-Winkler fuzzy
- **Validación semántica** por campo (score 0-100)
- **Exportación:** CSV, Excel, VCF, JSON, JSONL, HTML informes
- **CRM Export:** Google Contacts, HubSpot, Salesforce, Zoho, Airtable
- **Dashboard** con métricas en tiempo real
- **Historial/Undo** con snapshots (TTL 30 días, max 10)
- **Onboarding wizard** (3 pasos)
- **Modo simple/avanzado**
- **Dark mode** con next-themes
- **Keyboard shortcuts** (1-6 tabs, D tema, S modo, ? ayuda)
- **PWA** installable
- **Tabla virtualizada** para datasets grandes
- **FAQ / Help Center**
- **Privacy Policy + Terms of Service**
- **Cookie consent banner**
- **Error boundaries** granulares por sección

### ⚡ Con API key (gratis)
- **Limpieza con IA** (12 proveedores con rotación)
- **Pipeline 3 etapas:** limpiar → verificar → corregir
- **Validación IA** para campos ambiguos
- **Health check** de proveedores
- **Multi-key** por proveedor

### 🔧 Google Contacts
- **OAuth multi-cuenta** (hasta 5 cuentas)
- **Importación** de contactos desde Google People API
- **Borrado masivo** con confirmación de seguridad
- **Refresh token** para renovación de sesiones
- **User info** (email, nombre, avatar) al conectar

### 🔧 Configuración adicional
- Sentry error tracking (lazy-loaded)
- Cloudflare CDN

---

## 4. Pipeline de Procesamiento

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Parseo  │───▶│  Mapeo   │───▶│  Reglas  │───▶│ IA Clean │───▶│IA Verify │───▶│IA Correct│
│ CSV/Excel│    │ Auto-detect│   │ (80%+)   │    │ (20%)    │    │ (issues) │    │ (fix)    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                                                    │
                                                                                    ▼
                                                                            ┌──────────┐
                                                                            │ Validación│
                                                                            │ Semántica │
                                                                            └──────────┘
                                                                                    │
                                                                                    ▼
                                                                            ┌──────────┐
                                                                            │   Dedup   │
                                                                            │ O(n) hash │
                                                                            └──────────┘
```

**Detalles del pipeline:**
- **Reglas:** Limpieza determinística (capitalización, formato teléfono, email typos, junk detection)
- **IA Clean:** Prompt con 6 reglas de limpieza, batch de 25 contactos
- **IA Verify:** Compara original vs limpio, detecta issues
- **IA Correct:** Corrige issues detectados (solo si hay issues)
- **Fallback:** Si un proveedor falla, rota automáticamente al siguiente
- **Validation:** Score 0-100 por campo (nombre, apellido, email, teléfono, empresa, cargo)
- **Dedup:** Email exacto O(1) → teléfono exacto O(1) → nombre Jaro-Winkler O(k)

---

## 5. Proveedores IA

| # | ID | Proveedor | Modelo | Notas |
|---|-----|----------|--------|-------|
| 1 | groq | Groq Cloud | llama-3.3-70b-versatile | ⚡ Ultra rápido, free tier generoso |
| 2 | openrouter | OpenRouter | llama-3.3-70b-instruct:free | 🌐 Multi-modelo, free |
| 3 | gemini | Google AI Studio | gemini-2.0-flash-exp | ✨ Free tier muy generoso |
| 4 | cerebras | Cerebras | llama3.1-8b | 🧠 El más rápido (4ms) |
| 5 | together | Together AI | Llama-3.3-70B-Turbo-Free | 🤝 Llama 3.3 gratis |
| 6 | deepinfra | DeepInfra | Llama-3.3-70B-Instruct | 🔥 Pay-per-token económico |
| 7 | sambanova | SambaNova | Llama-3.3-70B-Instruct | 🚀 Free tier diario |
| 8 | mistral | Mistral AI | mistral-small-latest | 💨 Modelos europeos |
| 9 | deepseek | DeepSeek | deepseek-chat | 🔍 Muy económico |
| 10 | cloudflare | Cloudflare Workers AI | llama-3.3-70b-fp8 | ☁️ Edge computing |
| 11 | huggingface | Hugging Face | Llama-3.3-70B-Instruct | 🤗 Open source |
| 12 | nebius | Nebius AI | Llama-3.3-70B-Instruct | 🌌 Free credits |

**Configuración:** Rotación automática, multi-key por proveedor, retry exponencial (2 intentos), rate limit 30 req/min/IP, L1 cache 8s TTL

---

## 6. Importación y Exportación

### Formatos de Entrada

| Formato | Parser | Notas |
|---------|--------|-------|
| CSV (.csv, .txt) | PapaParse (lazy) | UTF-8, BOM support, auto-detect delimitador |
| Excel (.xlsx, .xls) | SheetJS (lazy) | Primera hoja, headers en fila 1 |
| VCF (.vcf) | Parser propio | vCard 3.0, multi-teléfono, ORG, TITLE, NOTE |
| JSON (.json) | JSON.parse | Auto-detect array vs object |
| Google Contacts | OAuth + People API | Multi-cuenta, hasta 5 |

### Formatos de Salida

| Formato | Uso | Archivo |
|---------|-----|---------|
| CSV genérico | Uso general | `exportCSV()` |
| Google Contacts CSV | **Re-importar a Google** | `exportGoogleContactsCSV()` |
| HubSpot CSV | CRM HubSpot | `exportHubSpotCSV()` |
| Salesforce CSV | CRM Salesforce | `exportSalesforceCSV()` |
| Zoho CRM CSV | CRM Zoho | `exportZohoCSV()` |
| Airtable CSV | Base de datos Airtable | `exportAirtableCSV()` |
| Excel (.xlsx) | 2 hojas (limpios + descartados) | `exportExcel()` |
| VCF (vCard 3.0) | Importar en teléfonos/WhatsApp | `exportVCF()` |
| JSON | Datos completos | `exportJSON()` |
| JSONL | Fine-tuning IA (OpenAI, HF) | `exportJSONL()` |
| HTML | Informe imprimible | `generateHTMLReport()` |

### Mapeo Automático de Columnas

Detección automática para nombres en español e inglés:
- `nombre`, `first name`, `given name` → firstName
- `apellido`, `last name`, `family name` → lastName
- `teléfono`, `phone`, `mobile`, `whatsapp`, `celular` → whatsapp
- `empresa`, `company`, `organization` → company
- `cargo`, `job title`, `position` → jobTitle
- `email`, `correo` → email

---

## 7. Google Contacts — Flujo Completo

### Flujo: Exportar → Limpiar → Borrar → Re-importar

```
1. Conectar cuenta Google (OAuth)
   └── Scope: contacts + contacts.readonly
   └── Obtiene: access_token + refresh_token + user info

2. Importar contactos
   └── People API: names, emails, phones, organizations
   └── Multi-cuenta (hasta 5)

3. Procesar (pipeline completo)
   └── Reglas → IA → Validación → Dedup

4. Exportar como "Google Contacts CSV"
   └── Formato re-importable a Google Contacts

5. Borrar contactos de Google (⚠️ IRREVERSIBLE)
   └── Diálogo de confirmación con advertencias
   └── batchDelete en chunks de 200
   └── Retry automático en 429

6. Re-importar CSV limpio a Google Contacts
   └── Desde Google Contacts web → Importar
```

### Edge Function: google-contacts-auth

| Acción | Descripción |
|--------|------------|
| `auth_url` | Genera URL de OAuth con scopes de lectura + escritura |
| `exchange` | Intercambia code por tokens + obtiene user info |
| `refresh` | Renueva access_token con refresh_token |
| `fetch_contacts` | Obtiene todos los contactos (paginado, 1000/página) |
| `delete_contacts` | **Elimina todos los contactos** (batch delete, chunks de 200) |

### Seguridad del Borrado
- Diálogo de confirmación obligatorio
- Advertencia de irreversibilidad
- Exportación como backup antes de borrar
- Resultado visual (éxito/parcial/errores)
- Rate limiting en Edge Function

---

## 8. Análisis Multidisciplinario

### Resumen por área

| Área | Promedio | Estado |
|------|----------|--------|
| Técnica (13 roles) | ⭐⭐⭐⭐⭐ | Sólido: hooks divididos, keys cifradas, E2E CI, lazy loading, error handling unificado |
| Producto y Gestión (8 roles) | ⭐⭐⭐⭐ | Completo: onboarding, FAQ, pricing, blog, CRM exports |
| Comercial y Crecimiento (8 roles) | ⭐⭐⭐ | SEO + landing + blog. Falta comunidad |
| Operaciones, Legal y Análisis (7 roles) | ⭐⭐⭐⭐ | GDPR compliant. Sentry integrado |

### Roles destacados

- **Software Architect** ⭐⭐⭐⭐⭐ — Hooks divididos en 3, pipeline desacoplado, ErrorBoundaries granulares
- **Cybersecurity** ⭐⭐⭐⭐⭐ — Keys AES-GCM, CSP, JWT, privacy-first, rate limiting DB-backed
- **DevOps** ⭐⭐⭐⭐⭐ — CI/CD con E2E, staging, rollback, Dependabot, performance budget
- **QA Automation** ⭐⭐⭐⭐⭐ — 219 unit + 21 E2E tests, coverage 70%+
- **DPO/Legal** ⭐⭐⭐⭐⭐ — GDPR completo: privacy, terms, cookies, data retention
- **Backend Developer** ⭐⭐⭐⭐⭐ — Edge Function type-safe, 12 proveedores, L1 cache, structured logs
- **Performance Engineer** ⭐⭐⭐⭐⭐ — Lazy loading, code splitting, Web Workers, bundle -31%

---

## 9. Historial de Sesiones

### Sesión 1 — 2026-05-01 — Edge Function Modernization
- `serve()` deprecated → `Deno.serve()` nativo
- Type safety fix: eliminado último `as any`
- Version sync

### Sesión 2 — 2026-05-02 — Unified Error Handling
- `error-handler.ts`: 8 categorías, 4 severidades, wrappers safeAsync/safeSync
- ErrorBoundaries granulares por sección (process, results, export, dashboard)
- 20 nuevos tests

### Sesión 3 — 2026-05-02 — Lazy Loading Heavy Dependencies
- PapaParse: lazy import (solo al parsear CSV)
- libphonenumber-js: lazy + preload en background
- recharts eliminado (dead dependency)
- Bundle: 433KB → 296KB (-31.6%)

### Sesión 4 — 2026-05-02 — Edge Function Optimization
- Rate limiting: 3 queries → 1 RPC atómica
- L1 in-memory cache (8s TTL, 0ms latency)
- Structured timing logs

### Sesión 5 — 2026-05-02 — Sentry Integration
- Sentry error tracking con tags estructurados
- beforeSend redacta API keys
- 5 canales de error reporting

### Sesión 6 — 2026-05-02 — Sentry Lazy-Load
- @sentry/react code-split del bundle principal
- Bundle principal: -21% en producción con DSN

### Sesión 7 — 2026-05-02 — Dead Dependency Removal
- date-fns eliminado (0 imports, -37MB node_modules)

### Sesión 8 — 2026-05-02 — Dead Dependencies Audit
- 9 deps eliminadas (embla, cmdk, input-otp, day-picker, vaul, resizable-panels, hookform, resolvers, zod)
- -19MB node_modules

### Sesión 9 — 2026-05-05 — Google Contacts Delete + CRM Exports
- Edge Function: `serve()` → `Deno.serve()`, scope escritura, delete_contacts, refresh, user info
- UI: botón borrar por cuenta + global, diálogo confirmación
- Export: 5 formatos CRM (Google, HubSpot, Salesforce, Zoho, Airtable)
- 219 tests, build 305KB

---

## 10. Infraestructura y Deploy

### URLs

| URL | Descripción |
|-----|------------|
| https://util.mejoraok.com/mejoracontactos/ | **App principal** |
| https://util.mejoraok.com/mejoracontactos/landing | Landing page |
| https://util.mejoraok.com/mejoracontactos/faq | FAQ |
| https://util.mejoraok.com/mejoracontactos/privacy | Privacidad |
| https://util.mejoraok.com/mejoracontactos/terms | Términos |
| https://util.mejoraok.com/mejoracontactos/pricing | Precios |
| https://util.mejoraok.com/mejoracontactos/blog | Blog |

### CI/CD Pipeline

```
push to main
  ├── npm ci --legacy-peer-deps
  ├── npm run lint (ESLint + TypeScript)
  ├── npm test (219 unit tests)
  ├── npm run build (Vite production)
  ├── Performance budget check (< 2MB total, < 450KB index)
  ├── Build smoke test (dist/index.html exists)
  ├── npm run build:test (base=/ for E2E)
  ├── npx playwright install --with-deps chromium
  ├── npx playwright test (21 E2E tests)
  ├── npm run build (production base path)
  ├── SSH: backup current deployment
  ├── SCP: upload dist/
  ├── HTTP 200 smoke test
  └── On failure: auto-rollback from backup
```

### Edge Functions

| Función | Estado | Deploy |
|---------|--------|--------|
| `clean-contacts` | ✅ Modernizado (Deno.serve) | `npx supabase functions deploy clean-contacts` |
| `google-contacts-auth` | ✅ Modernizado (Deno.serve) | `npx supabase functions deploy google-contacts-auth` |
| `log-error` | ✅ | `npx supabase functions deploy log-error` |

### Migraciones SQL

| Archivo | Estado | Acción |
|---------|--------|--------|
| `20260429_rate_limits.sql` | ⚠️ Pendiente | Ejecutar en Supabase Dashboard |
| `20260502_rate_limit_check.sql` | ⚠️ Pendiente | Ejecutar en Supabase Dashboard |

---

## 11. Seguridad

| Control | Estado | Detalle |
|---------|--------|---------|
| CSP headers | ✅ | Configurado en .htaccess |
| JWT verification | ✅ | Supabase Auth + anon key |
| Input validation | ✅ | 10K max contacts, 500 chars/field |
| XSS protection | ✅ | HTML escaping en informes |
| CORS whitelist | ✅ | 4 origins permitidos |
| Rate limiting | ✅ | DB-backed + L1 cache (8s TTL) |
| API keys AES-GCM | ✅ | Cifrado en localStorage |
| ErrorBoundary | ✅ | Granular por sección |
| Sentry | ✅ | Lazy-loaded, beforeSend redacta keys |
| Privacy Policy | ✅ | /privacy |
| Terms of Service | ✅ | /terms |
| Cookie consent | ✅ | Banner con opciones |
| Data retention | ✅ | TTL 30 días, max 10 snapshots |
| SECURITY.md | ✅ | Vulnerability reporting |
| .env protection | ✅ | .gitignore + .env.example |
| Dependabot | ✅ | Automated security updates |

---

## 12. Pendientes y Próximos Pasos

### 🔴 Requieren acción del usuario

| # | Tarea | Prioridad | Acción |
|---|-------|-----------|--------|
| 1 | Migration SQL | 🟡 Alta | Ejecutar `20260429_rate_limits.sql` y `20260502_rate_limit_check.sql` en Supabase Dashboard |
| 2 | Deploy Edge Functions | 🟡 Alta | `npx supabase functions deploy google-contacts-auth` (nueva versión con delete) |
| 3 | Re-conectar Google | 🟡 Alta | Cuentas existentes necesitan re-autenticarse para obtener scope de escritura |
| 4 | Sentry DSN | 🟢 Media | Crear proyecto en sentry.io, configurar `VITE_SENTRY_DSN` |
| 5 | Cloudflare CDN | 🟢 Media | Cambiar nameservers en Hostinger |
| 6 | Activar 3er proveedor IA | 🟢 Media | Activar key Gemini/OpenRouter para más redundancia |

### 🟢 Mejoras sugeridas (no bloqueantes)

| # | Tarea | Impacto | Tiempo est. |
|---|-------|---------|-------------|
| 1 | Sonner CSS-in-JS optimization | MEDIO | 20 min |
| 2 | CSP Headers + Security Headers audit | MEDIO | 20 min |
| 3 | Radix UI unused components audit | BAJO | 15 min |
| 4 | Product Hunt launch | ALTO | — |
| 5 | Twitter/X presencia | MEDIO | — |

---

## 13. Archivos Clave

### Core Pipeline

| Archivo | Qué hace |
|---------|----------|
| `src/hooks/useContactProcessing.ts` | Orquestador principal del pipeline |
| `src/hooks/useAIPipeline.ts` | Lógica IA + validación + proveedores |
| `src/hooks/useDedup.ts` | Deduplicación con DedupIndex O(n) |
| `src/lib/parsers.ts` | CSV, Excel, VCF, JSON parsers (lazy) |
| `src/lib/dedup.ts` | DedupIndex class + Jaro-Winkler |
| `src/lib/field-validator.ts` | Validación semántica por campo |
| `src/lib/phone-validator.ts` | Validación teléfono E.164 (lazy) |
| `src/lib/rule-cleaner.ts` | Limpieza determinística por reglas |
| `src/lib/column-mapper.ts` | Auto-detección de columnas |
| `src/workers/pipeline.worker.ts` | Web Worker para reglas |

### Exportación

| Archivo | Qué hace |
|---------|----------|
| `src/lib/export-utils.ts` | Todos los formatos de exportación (CSV, Excel, VCF, JSON, JSONL, HTML, CRM) |
| `src/components/ExportPanel.tsx` | UI de exportación con sección CRM |

### Google Contacts

| Archivo | Qué hace |
|---------|----------|
| `src/components/GoogleContactsPanel.tsx` | UI OAuth + import + delete + confirmación |
| `supabase/functions/google-contacts-auth/index.ts` | Edge Function: auth, fetch, delete, refresh |

### Infraestructura

| Archivo | Qué hace |
|---------|----------|
| `src/lib/db.ts` | IndexedDB + historial/undo |
| `src/lib/api-keys.ts` | Keys cifradas AES-GCM |
| `src/lib/error-handler.ts` | Error handling unificado (8 categorías) |
| `src/lib/error-reporter.ts` | 5 canales de error reporting |
| `src/lib/sentry.ts` | Sentry integration (lazy) |
| `src/lib/analytics.ts` | Analytics locales + Plausible |
| `src/lib/usage-limits.ts` | Free tier: 500/lote, 3 lotes/día |
| `src/lib/feature-flags.ts` | Feature flags |
| `src/integrations/supabase/client.ts` | Supabase client |

### Edge Functions

| Archivo | Qué hace |
|---------|----------|
| `supabase/functions/clean-contacts/index.ts` | Pipeline IA (12 proveedores, rotación, rate limit) |
| `supabase/functions/clean-contacts/prompts.ts` | System prompts para Clean/Verify/Correct |
| `supabase/functions/google-contacts-auth/index.ts` | Google OAuth + fetch + delete + refresh |

### UI Components

| Archivo | Qué hace |
|---------|----------|
| `src/pages/Index.tsx` | Página principal con tabs |
| `src/components/ProcessingPanel.tsx` | UI de procesamiento |
| `src/components/ContactsTable.tsx` | Tabla virtualizada de contactos |
| `src/components/DashboardPanel.tsx` | Métricas y gráficos |
| `src/components/ColumnMapper.tsx` | Mapeo manual de columnas |
| `src/components/OnboardingWizard.tsx` | Wizard de 3 pasos |
| `src/components/SimpleMode.tsx` | Modo simplificado |

### Configuración

| Archivo | Qué hace |
|---------|----------|
| `vite.config.ts` | Build config, chunks, lazy loading |
| `package.json` | Dependencies (0 dead deps) |
| `.github/workflows/deploy.yml` | CI/CD pipeline completo |
| `.github/workflows/ci.yml` | CI para PRs |
| `tailwind.config.ts` | Tailwind + shadcn/ui config |

---

## 14. Comandos Rápidos

```bash
# Desarrollo
npm install --legacy-peer-deps && npm run dev   # http://localhost:8080

# Tests
npx vitest run                                   # 219 unit tests
npx vitest run --coverage                        # Con coverage
npx playwright test                              # 21 E2E tests

# Build
npx vite build                                   # Build producción
npx vite build --mode development                # Build desarrollo

# Deploy
git push origin main                             # Deploy automático via GitHub Actions

# Edge Functions
npx supabase functions deploy clean-contacts     # Deploy pipeline IA
npx supabase functions deploy google-contacts-auth # Deploy Google OAuth + delete

# Análisis
npx vite build --stats                           # Bundle analysis
bash scripts/perf-check.sh                       # Performance budget check
```

---

## 15. Convenciones

- **Idioma:** UI en español, código en inglés
- **"documentar":** Actualiza este MASTERPLAN.md con el estado actual
- **Commits:** `tipo: descripción` (feat, fix, docs, chore, ci, perf)
- **Branch:** `main` (deploy automático)
- **NO commitear:** `.env`, tokens, API keys
- **Tests:** Cada feature nuevo debe tener tests
- **Bundle budget:** < 450KB index, < 2MB total

---

*Documento maestro — Actualizar al decir "documentar".*
*2026-05-05 04:11 GMT+8 — 219 tests · 21 E2E · v12.8 · 12 proveedores IA · Google Contacts delete · CRM exports · Pipeline híbrido · GDPR · BETA*
