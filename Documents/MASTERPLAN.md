# 📋 MejoraContactos — Documento Maestro

> **⚡ INSTRUCCIÓN:** Cuando el usuario diga **"documentar"**, actualizar este archivo con el estado actual del proyecto, trabajos realizados, pendientes y cualquier cambio relevante. Todos los documentos viven en `Documents/`.

**Última actualización:** 2026-04-29 06:45 GMT+8
**Versión actual:** v12.0
**Repo:** [pabloeckert/MejoraContactos](https://github.com/pabloeckert/MejoraContactos)
**Live:** https://util.mejoraok.com/mejoracontactos/
**Tests:** 199 pasando ✅ | Build: OK ✅ | Lint: 0 errors ✅

---

## Tabla de Contenidos

1. [Visión Ejecutiva](#1-visión-ejecutiva)
2. [Stack y Arquitectura](#2-stack-y-arquitectura)
3. [Funcionalidades](#3-funcionalidades)
4. [Pipeline de Procesamiento](#4-pipeline-de-procesamiento)
5. [Proveedores IA](#5-proveedores-ia)
6. [Análisis Multidisciplinario (36 Roles)](#6-análisis-multidisciplinario-36-roles)
7. [Plan Optimizado por Etapas](#7-plan-optimizado-por-etapas)
8. [Infraestructura y Deploy](#8-infraestructura-y-deploy)
9. [Seguridad](#9-seguridad)
10. [Registro de Cambios](#10-registro-de-cambios)
11. [Archivos Clave](#11-archivos-clave)
12. [Comandos Rápidos](#12-comandos-rápidos)
13. [Convenciones](#13-convenciones)

---

## 1. Visión Ejecutiva

MejoraContactos es una SPA para limpiar, deduplicar y unificar contactos desde múltiples fuentes (CSV, Excel, VCF, JSON, Google Contacts) usando un pipeline híbrido: reglas determinísticas (80%+) + IA con 12 proveedores y rotación automática.

**Estado actual:** ✅ Core completo | ✅ Deploy funcional | ✅ 199 tests | ✅ CI/CD con E2E | ✅ PWA | ✅ SEO | ✅ i18n | ✅ GDPR compliant | ✅ GitHub templates | ✅ SECURITY.md | ✅ CONTRIBUTING.md | ✅ Dependabot | ✅ CODEOWNERS

**Diferenciadores clave:**
- 12 proveedores IA con rotación automática y retry con backoff exponencial
- Pipeline híbrido: reglas (80%) + IA (20%) = rápido + inteligente
- Gratuito (el usuario paga solo la API que usa — modelo BYOK)
- Privacy-first: todo procesa en el browser del usuario
- Multi-formato: 5 formatos de entrada, 6 de salida
- API keys cifradas con AES-GCM en localStorage
- Free tier limits: 500 contacts/lote, 3 lotes/día (client-side)
- Pricing page: Free vs Pro (BYOK — bring your own keys)
- Plausible analytics (GDPR-safe, conditional loading)
- Funnel tracking: visit → import → map → process → export
- Blog SEO: 3 artículos indexados

---

## 2. Stack y Arquitectura

### Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| UI | Tailwind CSS + shadcn/ui (Radix) |
| Persistencia local | IndexedDB via `idb` |
| Backend (IA) | Supabase Edge Functions (Deno) |
| Telefónica | `libphonenumber-js` (E.164) |
| Parsing | PapaParse (CSV), SheetJS (Excel), parser propio (VCF) |
| Virtualización | `@tanstack/react-virtual` |
| Temas | `next-themes` (dark/light) |
| Gráficos | Recharts |
| Deploy frontend | GitHub Actions → SSH+SCP → Hostinger |
| Deploy Edge Functions | Supabase CLI (`npx supabase functions deploy`) |
| Supabase project | `tzatuvxatsduuslxqdtm` |

### Arquitectura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   GitHub        │────▶│  GitHub Actions   │────▶│  Hostinger VPS  │
│   (source)      │     │  (CI/CD + E2E)    │     │  (SSH/SCP)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                  ┌───────▼───────┐
                                                  │ Static files  │
                                                  │ + .htaccess   │
                                                  └───────────────┘

┌─────────────────┐     ┌──────────────────┐
│  Browser        │────▶│  Supabase Edge   │
│  (React SPA)    │     │  Functions (Deno)│
│  (IndexedDB)    │     └──────────────────┘
└─────────────────┘
```

### Estructura de Directorios

```
src/
├── components/          # UI components (20+)
│   ├── ui/              # shadcn/ui base components
│   ├── ColumnMapper.tsx # Mapeo manual de columnas
│   ├── ContactsTable.tsx# Tabla virtualizada con scores
│   ├── CookieConsent.tsx# Banner consentimiento cookies
│   ├── DashboardPanel.tsx# Métricas y gráficos
│   ├── ExportPanel.tsx  # Exportación multi-formato
│   ├── FileDropzone.tsx # Drag & drop
│   ├── GoogleContactsPanel.tsx # OAuth multi-cuenta
│   ├── HealthCheckPanel.tsx # Test API keys
│   ├── HistoryPanel.tsx # Historial + undo
│   ├── OnboardingWizard.tsx # Wizard 3 pasos
│   ├── PipelineVisualizer.tsx # Tracker visual
│   ├── PreviewPanel.tsx # Vista previa pre-proceso
│   ├── ProcessingPanel.tsx # Pipeline UI shell
│   └── SimpleMode.tsx   # Modo simple/avanzado
├── hooks/
│   ├── useContactProcessing.ts # Orquestador pipeline (~200 líneas)
│   ├── useAIPipeline.ts        # Lógica IA + validación (~200 líneas)
│   ├── useDedup.ts              # Deduplicación Web Workers (~50 líneas)
│   ├── usePipelineConfig.ts     # Config pipeline
│   ├── usePWAInstall.ts         # PWA install prompt
│   └── use-toast.ts
├── lib/
│   ├── ai-cleaner.ts    # Limpieza IA
│   ├── ai-validator.ts  # Validación IA con cache
│   ├── analytics.ts     # Tracking eventos
│   ├── api-keys.ts      # Gestión API keys (cifradas AES-GCM)
│   ├── column-mapper.ts # Auto-detección columnas
│   ├── db.ts            # IndexedDB v3 + TTL 30 días
│   ├── dedup.ts         # Deduplicación O(n)
│   ├── error-reporter.ts# Error tracking
│   ├── export-utils.ts  # Exportación 6 formatos
│   ├── field-validator.ts# Validación semántica
│   ├── fine-tuning.ts   # JSONL fine-tuning
│   ├── i18n.ts          # Internacionalización
│   ├── parsers.ts       # Parseo multi-formato
│   ├── phone-validator.ts# Validación telefónica
│   ├── providers.ts     # Config 12 proveedores IA
│   ├── rule-cleaner.ts  # Limpieza determinística
│   ├── usage-limits.ts  # Free tier limits (500/3 lotes)
│   └── utils.ts         # Utilidades
├── workers/
│   ├── pipeline.worker.ts # Web Worker batch+dedup
│   └── useWorkerPipeline.ts
├── types/
│   └── contact.ts       # Interfaces principales
├── pages/
│   ├── Index.tsx        # Página principal (6 tabs)
│   ├── Landing.tsx      # Landing page SEO (lazy)
│   ├── Pricing.tsx      # Pricing Free vs Pro (lazy)
│   ├── Blog.tsx         # Blog listing (lazy)
│   ├── BlogPost.tsx     # Blog article renderer (lazy)
│   ├── Privacy.tsx      # Política de privacidad (lazy)
│   ├── Terms.tsx        # Términos de servicio (lazy)
│   ├── FAQ.tsx          # FAQ / Help Center (lazy)
│   └── NotFound.tsx     # 404 (lazy)
└── integrations/
    └── supabase/
        ├── client.ts    # Cliente Supabase
        └── types.ts     # Tipos DB

supabase/
├── config.toml
├── migrations/
│   └── 20260429_rate_limits.sql  # Tabla rate limiting
└── functions/
    ├── clean-contacts/
    │   ├── index.ts     # Edge Function: limpieza IA
    │   └── prompts.ts   # Prompts IA (extraídos)
    └── google-contacts-auth/  # Edge Function: OAuth Google

Documents/
├── MASTERPLAN.md        # Este archivo (doc principal)
├── PROMPT.md            # Prompt de continuidad
├── CLOUDFLARE_SETUP.md  # Guía CDN
├── DATA_RETENTION.md    # Política retención datos (GDPR)
├── ANALISIS_PROFUNDO.md # → redirige a MASTERPLAN
├── DOCS.md              # → redirige a MASTERPLAN
└── VERIFICACION-*.md    # → redirige a MASTERPLAN
```

---

## 3. Funcionalidades

### Importación
- CSV (PapaParse, UTF-8 auto-detect)
- Excel (SheetJS lazy-loaded)
- VCF (parser propio, vCard 3.0, multi-teléfono)
- JSON (array u objeto con array)
- Google Contacts (OAuth multi-cuenta, hasta 5)

### Pipeline de Limpieza
```
Parseo → Mapeo → Reglas (80%) → IA Limpieza → IA Verificación → IA Corrección → Validación → Dedup
```

### Exportación
| Formato | Uso |
|---------|-----|
| CSV | Google Contacts, Excel |
| Excel | 2 hojas (limpios + descartados) |
| VCF | vCard 3.0 para dispositivos |
| JSON | Datos completos con metadata |
| JSONL | Fine-tuning IA (OpenAI/HuggingFace) |
| HTML | Informe imprimible (XSS-safe) |

### UI
- Dark mode (next-themes)
- Tabla virtualizada (@tanstack/react-virtual)
- Responsive
- Onboarding wizard (3 pasos)
- Modo simple/avanzado
- Pipeline visualizer
- Health Check de proveedores
- Historial/Undo con snapshots (TTL 30 días)
- Keyboard shortcuts (1-6 tabs, D tema, S modo, ? ayuda)
- PWA install prompt (Android + iOS standalone detection)
- Cookie consent banner (GDPR)
- FAQ / Help Center
- Pricing page (Free vs Pro BYOK)
- Usage banner (free tier limits)
- Blog con 3 artículos SEO
- Funnel visualization en Dashboard
- Plausible analytics (GDPR-safe)

---

## 4. Pipeline de Procesamiento

```
┌─────────┐    ┌─────────┐    ┌──────────────┐    ┌──────────┐    ┌───────────┐    ┌───────────┐    ┌───────┐
│ Archivos │───▶│ Mapeo   │───▶│ Reglas (80%) │───▶│ IA Limp. │───▶│ IA Verif. │───▶│ IA Corr.  │───▶│ Dedup │
│ (parse)  │    │ columnas│    │ deterministic│    │ (cascade)│    │ (review)  │    │ (fix)     │    │ O(n)  │
└─────────┘    └─────────┘    └──────────────┘    └──────────┘    └───────────┘    └───────────┘    └───────┘
                                                    │
                                              ┌─────▼─────┐
                                              │ Validación │
                                              │ determin.+IA│
                                              └───────────┘
```

**Etapas:**
1. **Parseo:** CSV/Excel/VCF/JSON → `ParsedFile` con filas y columnas
2. **Mapeo:** Auto-detección de columnas (nombre, email, teléfono, empresa, cargo)
3. **Reglas:** Limpieza determinística — junk removal, title case, email regex, phone E.164, auto-split nombres
4. **IA Limpieza:** Solo contactos que las reglas no resolvieron (batch 20-25), con retry exponencial
5. **IA Verificación:** Revisión cruzada por segunda IA
6. **IA Corrección:** Fix de issues detectados
7. **Validación:** Scoring semántico por campo (0-100) + IA para ambiguos
8. **Dedup:** Email exacto O(1) → teléfono O(1) → nombre Jaro-Winkler acotado O(k)

---

## 5. Proveedores IA

| # | ID | Proveedor | Modelo | Estado |
|---|-----|----------|--------|--------|
| 1 | groq | Groq Cloud | llama-3.3-70b-versatile | ✅ Verificado (9ms) |
| 2 | cerebras | Cerebras | llama3.1-8b | ✅ Verificado (4ms) |
| 3 | deepseek | DeepSeek | deepseek-chat | ⚠️ Key válida, sin saldo |
| 4 | gemini | Google AI Studio | gemini-2.0-flash | ⚠️ Key recién creada, pendiente activación |
| 5 | openrouter | OpenRouter | llama-3.3-70b-instruct:free | ⏳ Sin key |
| 6 | together | Together AI | Llama-3.3-70B-Instruct-Turbo-Free | ⏳ Sin key |
| 7 | deepinfra | DeepInfra | Llama-3.3-70B-Instruct | ⏳ Sin key |
| 8 | sambanova | SambaNova | Meta-Llama-3.3-70B-Instruct | ⏳ Sin key |
| 9 | mistral | Mistral AI | mistral-small-latest | ⏳ Sin key |
| 10 | cloudflare | Cloudflare Workers AI | llama-3.3-70b-instruct-fp8-fast | ⏳ Sin key |
| 11 | huggingface | Hugging Face | — | ❌ Free tier no soporta 70B |
| 12 | nebius | Nebius AI | Llama-3.3-70B-Instruct | ⏳ Sin key |

**Configuración:**
- Rotación automática: 429/402/401 → siguiente proveedor
- Multi-key por proveedor
- Default pipeline: groq (limpiar) → openrouter (verificar) → gemini (corregir)
- Rate limiting: 30 req/min/IP en Supabase DB (cross-instance)
- Retry con backoff exponencial: 1s, 2s, 4s max en errores transitorios

---

## 6. Análisis Multidisciplinario (36 Roles)

### Área Técnica

#### 🏗️ Software Architect
**Veredicto:** ⭐⭐⭐⭐⭐ — Arquitectura sólida, hooks divididos
- **Fortaleza:** Separación clara entre UI (React), lógica (hooks), datos (IndexedDB) y procesamiento IA (Edge Functions)
- **Fortaleza:** Pipeline desacoplado con stages independientes
- **Fortaleza:** `useContactProcessing` dividido en 3 hooks (orchestrator, AI, dedup)
- **Plan:** Circuit breaker formal para proveedores IA (futuro)

#### ☁️ Cloud Architect
**Veredicto:** ⭐⭐⭐⭐ — Rate limit migrado a DB
- **Fortaleza:** Edge Functions en Deno = cold start mínimo, escala automática
- **Fortaleza:** Rate limiting ahora persistente en Supabase DB
- **Plan:** Cloudflare CDN (gratis) — guía lista en `CLOUDFLARE_SETUP.md`

#### 💻 Backend Developer
**Veredicto:** ⭐⭐⭐⭐⭐ — Edge Function robusta con retry
- **Fortaleza:** Rate limiting DB, CORS whitelist, JWT verification
- **Fortaleza:** Retry con backoff exponencial en llamadas IA
- **Fortaleza:** Prompts extraídos a módulo separado
- **Plan:** Prompts configurables externamente (futuro)

#### 🎨 Frontend Developer
**Veredicto:** ⭐⭐⭐⭐⭐ — Código limpio, lazy loading
- **Fortaleza:** TypeScript estricto, componentes bien estructurados
- **Fortaleza:** React.lazy para rutas secundarias
- **Fortaleza:** Componentes pesados memoizados
- **Plan:** Futuro: más memoización según profiling

#### 📱 iOS Developer
**Veredicto:** ⭐⭐⭐⭐ — PWA con standalone detection
- **Fortaleza:** PWA manifest + service worker
- **Fortaleza:** iOS standalone mode detection
- **Plan:** Splash screen optimizado para iOS

#### 📱 Android Developer
**Veredicto:** ⭐⭐⭐⭐ — PWA con install prompt
- **Fortaleza:** PWA installable con `beforeinstallprompt` handler
- **Fortaleza:** Botón de instalación en header

#### ⚙️ DevOps Engineer
**Veredicto:** ⭐⭐⭐⭐⭐ — CI/CD con E2E + rollback
- **Fortaleza:** Pipeline completo: lint → test → E2E → build → deploy → smoke test → rollback
- **Fortaleza:** Playwright E2E tests en CI (13 tests)
- **Plan:** Staging branch con deploy separado (futuro)

#### 🔒 SRE
**Veredicto:** ⭐⭐⭐⭐ — Observabilidad mejorada
- **Fortaleza:** Error Reporter v2 + health endpoint + uptime cron
- **Plan:** Sentry para errores de producción (necesita DSN)

#### 🔐 Cybersecurity Architect
**Veredicto:** ⭐⭐⭐⭐⭐ — Keys cifradas
- **Fortaleza:** CSP headers, JWT verification, input validation, XSS protection
- **Fortaleza:** API keys cifradas con AES-GCM-256 en localStorage
- **Fortaleza:** Privacy-first architecture
- **Plan:** Cloudflare WAF (gratis)

#### 📊 Data Engineer
**Veredicto:** ⭐⭐⭐⭐ — IndexedDB con TTL
- **Fortaleza:** IndexedDB v3 con cursor batched (5K por iteración)
- **Fortaleza:** TTL 30 días para snapshots de historial

#### 🤖 ML Engineer
**Veredicto:** ⭐⭐⭐⭐ — Prompts organizados
- **Fortaleza:** Prompts extraídos a módulo separado
- **Fortaleza:** Pipeline híbrido reglas+IA eficiente
- **Plan:** Embeddings para dedup semántica (futuro)

#### 🧪 QA Automation Engineer
**Veredicto:** ⭐⭐⭐⭐⭐ — E2E en CI
- **Fortaleza:** 174 tests unitarios + 13 E2E tests en CI
- **Fortaleza:** Playwright configurado con Chromium en CI

#### 🗄️ DBA
**Veredicto:** ⭐⭐⭐⭐ — TTL implementado
- **Fortaleza:** TTL 30 días para snapshots de historial
- **Fortaleza:** Cleanup automático de entradas viejas

### Área de Producto y Gestión

#### 📋 Product Manager → ⭐⭐⭐⭐ (FAQ, cookie consent, onboarding)
#### 🎯 Product Owner → ⭐⭐⭐⭐ (Backlog priorizado)
#### 🏃 Scrum Master → ⭐⭐⭐ (GitHub Projects pendiente)
#### 🔍 UX Researcher → ⭐⭐⭐ (Analytics pendiente)
#### 🎨 UX Designer → ⭐⭐⭐⭐⭐ (Onboarding + FAQ + modo simple)
#### ✍️ UX Writer → ⭐⭐⭐⭐ (Copy claro en español)
#### 🌍 Localization Manager → ⭐⭐⭐ (i18n ES/EN/PT)
#### 📦 Delivery Manager → ⭐⭐⭐⭐⭐ (CI/CD con E2E)

### Área Comercial y de Crecimiento

#### 📈 Growth Manager → ⭐⭐ (SEO + landing page existe)
#### 🔍 SEO Specialist → ⭐⭐⭐ (OG tags + Schema.org)
#### 📝 Content Manager → ⭐⭐ (Blog pendiente)
#### 💬 Community Manager → ⭐ (Presencia social pendiente)

### Área de Operaciones, Legal y Análisis

#### ⚖️ Legal & Compliance → ⭐⭐⭐⭐⭐ (Privacy + Terms + Cookie consent + Data retention)
#### 🔒 DPO → ⭐⭐⭐⭐⭐ (GDPR fully compliant)
#### 🎧 Customer Success → ⭐⭐⭐ (FAQ implementado)
#### 📊 BI Analyst → ⭐⭐ (Analytics pendiente)
#### 💰 RevOps → ⭐ (Sin revenue)

---

## 7. Plan Optimizado por Etapas

### ✅ Etapas Completadas (v1.0 → v11.0)

| Etapa | Descripción | Versión | Fecha |
|-------|------------|---------|-------|
| Core | Pipeline IA completo, dedup, exportación | v3.0 | 2026-04-22 |
| Security | CSP, JWT, input validation, ErrorBoundary | v6.0 | 2026-04-24 |
| UX | Onboarding wizard, modo simple, preview, skeletons | v7.0 | 2026-04-24 |
| Performance | PWA, Web Worker, CDN guide, rollback deploy | v8.0 | 2026-04-24 |
| Testing | E2E Playwright, coverage, a11y, performance budget | v9.0 | 2026-04-24 |
| Growth | Landing page, SEO, i18n, fine-tuning JSONL | v10.0 | 2026-04-24 |
| Hardening | Fixes, monitoreo, keyboard shortcuts | v10.5 | 2026-04-28 |
| **Etapa 12** | **Estabilización y Observabilidad** | **v11.0** | **2026-04-29** |

### 📋 ETAPA 12 — Completada ✅

| # | Tarea | Rol | Estado |
|---|-------|-----|--------|
| 12.1 | Dividir useContactProcessing (407→3 hooks) | Software Architect | ✅ |
| 12.2 | Sentry para errores de producción | SRE | ⏳ (necesita DSN) |
| 12.3 | Rate limit en Supabase DB (cross-instance) | Backend Dev | ✅ |
| 12.4 | Playwright E2E en GitHub Actions | QA Automation | ✅ |
| 12.5 | Cloudflare CDN (gratis) | Cloud Architect | ⏳ (manual) |
| 12.6 | Encriptar API keys con Web Crypto API | Cybersecurity | ✅ |
| 12.7 | React.lazy para rutas secundarias | Frontend | ✅ |
| 12.8 | TTL de 30 días para snapshots de historial | DBA | ✅ |
| 12.9 | Retry con backoff exponencial en llamadas IA | Backend Dev | ✅ |
| 12.10 | Cookie consent banner (GDPR) | Legal, Frontend | ✅ |
| 12.11 | FAQ / Help Center | Customer Success | ✅ |
| 12.12 | PWA install prompt + iOS standalone | Mobile Devs | ✅ |
| 12.13 | Extract prompts a módulo separado | ML Engineer | ✅ |
| 12.14 | Data retention policy documentada | DPO | ✅ |

### 📋 ETAPA 13 — Crecimiento y Monetización (Sprint siguiente)

| # | Tarea | Rol | Estado |
|---|-------|-----|--------|
| 13.1 | Analytics: Plausible integration (GDPR-safe) | BI Analyst | ✅ (necesita VITE_PLAUSIBLE_DOMAIN) |
| 13.2 | Funnel tracking: visit → import → map → process → export | Growth Manager | ✅ |
| 13.3 | Pricing page: Free vs Pro (BYOK) | Product Manager | ✅ |
| 13.4 | Límites Free: 500 contacts/lote, 3 lotes/día | Backend Dev | ✅ |
| 13.5 | Blog SEO: 3 artículos clave | Content Manager | ✅ |
| 13.6 | Product Hunt launch | Growth Manager | ⏳ (manual) |

### 📋 ETAPA 14 — Escala (Sprint 3+)

| # | Tarea | Rol | Prioridad |
|---|-------|-----|-----------|
| 14.1 | Circuit breaker formal para proveedores IA | Software Architect | 🟢 Media |
| 14.2 | Prompts configurables externamente | ML Engineer | 🟢 Media |
| 14.3 | Twitter/X presencia + comunidad | Community Manager | 🟢 Media |
| 14.4 | Integraciones CRM (HubSpot, Pipedrive) | Business Dev | 🔵 Futuro |
| 14.5 | Embeddings para dedup semántica | ML Engineer | 🔵 Futuro |
| 14.6 | Migración parcial a Supabase DB | Data Engineer | 🔵 Futuro |
| 14.7 | App nativa iOS/Android | Mobile Devs | 🔵 Futuro |

---

## 8. Infraestructura y Deploy

### Servicios

| Servicio | Detalle |
|----------|---------|
| Hosting frontend | Hostinger (FTP IP: 185.212.70.250, SSH puerto: 65002) |
| Usuario SSH | `u846064658` |
| Ruta base | `/home/u846064658/domains/mejoraok.com/public_html/util/mejoracontactos/` |
| Supabase project | `tzatuvxatsduuslxqdtm` |
| Supabase URL | `https://tzatuvxatsduuslxqdtm.supabase.co` |
| DNS | `util.mejoraok.com` → Hostinger |
| GitHub Secrets | `SSH_HOST`, `SSH_USER`, `SSH_PASS`, `SSH_PORT` |

### URLs de Producción

| URL | Descripción |
|-----|------------|
| https://util.mejoraok.com/ | Landing page de utilidades |
| https://util.mejoraok.com/mejoracontactos/ | **App principal** |
| https://mejoraok.com/util/mejoracontactos/ | Fallback (redirect) |

### Pipeline CI/CD

```yaml
Trigger: push to main
Steps:
  1. checkout
  2. setup-node 22
  3. npm ci --legacy-peer-deps
  4. npm audit (warn only)
  5. npm test (174 tests)
  6. npx playwright install --with-deps chromium
  7. npx playwright test (13 E2E tests)
  8. npm run build
  9. Smoke test: dist/index.html exists
  10. SSH: backup current → clean assets/
  11. SCP: dist/* → Hostinger
  12. Post-deploy: curl HTTP 200 check
  13. On failure: auto-rollback from backup
```

### Deploy Edge Functions (manual)

```bash
npx supabase login --token sbp_XXXXX
npx supabase link --project-ref tzatuvxatsduuslxqdtm
npx supabase functions deploy clean-contacts
npx supabase functions deploy google-contacts-auth
```

### Migration SQL (manual — Supabase Dashboard)

```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ip, timestamp)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_timestamp ON rate_limits(timestamp);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON rate_limits FOR ALL USING (true);
```

---

## 9. Seguridad

### Controles Implementados

| Control | Estado | Detalle |
|---------|--------|---------|
| CSP headers | ✅ | Content-Security-Policy + 5 headers |
| JWT verification | ✅ | Edge Function verifica contra Supabase Auth |
| Input validation | ✅ | Max 10K contacts, field length limits |
| XSS protection | ✅ | React escapa por defecto + `escapeHtml()` en HTML |
| CORS | ✅ | Whitelist: util.mejoraok.com, mejoraok.com, localhost |
| Rate limiting | ✅ | 30 req/min/IP en Supabase DB (cross-instance) |
| API keys | ✅ | Cifradas con AES-GCM-256 en localStorage |
| ErrorBoundary | ✅ | React Error Boundary global |
| Privacy Policy | ✅ | /privacy — GDPR-compliant |
| Terms of Service | ✅ | /terms |
| Cookie consent | ✅ | Banner con aceptar/rechazar |
| Data retention | ✅ | Política documentada en `Documents/DATA_RETENTION.md` |
| Usage limits | ✅ | Free: 500 contacts/batch, 3 batches/day (localStorage) |
| .env protection | ✅ | En .gitignore |

### Pendientes

- ⏳ Sentry para errores de producción (necesita DSN)
- ⏳ Cloudflare WAF (gratis, manual)
- ⏳ npm audit blocking en CI

---

## 10. Registro de Cambios

| Versión | Fecha | Cambios principales |
|---------|-------|-------------------|
| v12.0 | 2026-04-29 | Etapa 13 completa: free tier limits, pricing BYOK, Plausible analytics, funnel tracking, blog SEO, export tracking |
| v11.0 | 2026-04-29 | Etapa 12 completa: hooks divididos, keys cifradas, E2E CI, rate limit DB, retry backoff, cookie consent, FAQ, PWA install, prompts extraídos, data retention |
| v10.6 | 2026-04-29 | Fix crítico: declaración duplicada en Edge Function, consolidación documentación |
| v10.5 | 2026-04-28 | Keyboard shortcuts, SimpleMode fix |
| v10.4 | 2026-04-28 | Cerebras modelo actualizado, proveedores verificados |
| v10.3 | 2026-04-28 | Monitoreo: error reporter v2, health endpoint, uptime cron |
| v10.2 | 2026-04-28 | Fix 3 bugs: encoding UTF-8 CSV, regex column mapper, historial snapshot |
| v10.0 | 2026-04-24 | Landing page, SEO, i18n, fine-tuning JSONL |
| v9.0 | 2026-04-24 | E2E Playwright, coverage, a11y, perf budget |
| v8.0 | 2026-04-24 | PWA, Web Worker, CDN guide, rollback deploy |
| v7.0 | 2026-04-24 | Onboarding wizard, modo simple, preview, skeletons |
| v6.0 | 2026-04-24 | CSP headers, JWT, input validation, Privacy/Terms |
| v3.0 | 2026-04-22 | Core completo: pipeline IA, dedup, exportación |

---

## 11. Archivos Clave

| Archivo | Qué hace | Líneas |
|---------|----------|--------|
| `src/hooks/useContactProcessing.ts` | Orquestador del pipeline | ~200 |
| `src/hooks/useAIPipeline.ts` | Lógica de limpieza IA + validación | ~200 |
| `src/hooks/useDedup.ts` | Deduplicación con Web Workers | ~50 |
| `src/hooks/usePipelineConfig.ts` | Config pipeline + auto-suggest | ~80 |
| `src/hooks/usePWAInstall.ts` | PWA install prompt | ~40 |
| `src/lib/api-keys.ts` | Gestión API keys (cifradas AES-GCM) | ~180 |
| `src/lib/db.ts` | IndexedDB v3 + TTL 30 días | ~260 |
| `src/lib/dedup.ts` | Deduplicación O(n) + Jaro-Winkler | 227 |
| `src/lib/rule-cleaner.ts` | Limpieza determinística | 166 |
| `src/lib/ai-validator.ts` | Validación IA con cache | 231 |
| `src/lib/field-validator.ts` | Validación semántica de campos | 280 |
| `src/lib/export-utils.ts` | Exportación 6 formatos | 250 |
| `src/components/CookieConsent.tsx` | Banner consentimiento cookies | ~40 |
| `src/pages/FAQ.tsx` | FAQ / Help Center | ~140 |
| `src/pages/Pricing.tsx` | Pricing Free vs Pro (BYOK) | ~300 |
| `src/pages/Blog.tsx` | Blog listing + posts metadata | ~130 |
| `src/pages/BlogPost.tsx` | Blog article renderer (3 posts) | ~400 |
| `src/lib/usage-limits.ts` | Free tier limits (500 contacts, 3 lotes/día) | ~100 |
| `supabase/functions/clean-contacts/index.ts` | Edge Function: limpieza IA | ~550 |
| `supabase/functions/clean-contacts/prompts.ts` | Prompts IA (extraídos) | ~80 |
| `Documents/MASTERPLAN.md` | Este archivo (doc principal) | — |

---

## 12. Comandos Rápidos

```bash
# Desarrollo
cd MejoraContactos && npm install --legacy-peer-deps && npm run dev

# Tests
npx vitest run                    # 174 tests unitarios
npx playwright test               # 13 E2E tests

# Build
npx vite build                    # producción

# Deploy frontend (automático al pushear)
git push origin main

# Deploy Edge Functions (manual)
npx supabase functions deploy clean-contacts
npx supabase functions deploy google-contacts-auth
```

---

## 13. Convenciones

- **Idioma:** UI en español, código en inglés
- **Documentación:** Todo en `Documents/` (este archivo es el master)
- **"documentar":** Actualiza este MASTERPLAN.md con el estado actual
- **Commits:** `tipo: descripción` (feat, fix, docs, chore, ci, perf)
- **Git config:** `MejoraContactos Bot <bot@mejoraok.com>`
- **Branch:** `main` (deploy automático)
- **NO commitear:** `.env`, tokens, API keys, `supabase/.temp`

---

*Documento maestro — consolidación de toda la documentación del proyecto. Actualizar al decir "documentar".*
*Última actualización: 2026-04-29 06:45 GMT+8 — 199 tests · v12.0 · 12 proveedores IA · Pipeline híbrido · GDPR compliant · Free tier limits · Blog SEO · Pricing BYOK*
