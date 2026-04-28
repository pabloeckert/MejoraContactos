# 📋 MejoraContactos — Documento Maestro

> **⚡ INSTRUCCIÓN:** Cuando el usuario diga **"documentar"**, actualizar este archivo con el estado actual del proyecto, trabajos realizados, pendientes y cualquier cambio relevante. Todos los documentos viven en `Documents/`.

**Última actualización:** 2026-04-29 06:15 GMT+8
**Versión actual:** v10.6
**Repo:** [pabloeckert/MejoraContactos](https://github.com/pabloeckert/MejoraContactos)
**Live:** https://util.mejoraok.com/mejoracontactos/
**Tests:** 174 pasando ✅ | Build: OK ✅

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

**Estado actual:** ✅ Core completo | ✅ Deploy funcional | ✅ 174 tests | ✅ CI/CD automático | ✅ PWA | ✅ SEO | ✅ i18n

**Diferenciadores clave:**
- 12 proveedores IA con rotación automática (resiliencia)
- Pipeline híbrido: reglas (80%) + IA (20%) = rápido + inteligente
- Gratuito (el usuario paga solo la API que usa)
- Privacy-first: todo procesa en el browser del usuario
- Multi-formato: 5 formatos de entrada, 6 de salida

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
│   (source)      │     │  (CI/CD)          │     │  (SSH/SCP)      │
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
│   ├── useContactProcessing.ts # Lógica central pipeline (407 líneas)
│   ├── usePipelineConfig.ts    # Config pipeline
│   └── use-toast.ts
├── lib/
│   ├── ai-cleaner.ts    # Limpieza IA
│   ├── ai-validator.ts  # Validación IA con cache
│   ├── analytics.ts     # Tracking eventos
│   ├── api-keys.ts      # Gestión API keys
│   ├── column-mapper.ts # Auto-detección columnas
│   ├── db.ts            # IndexedDB v3
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
│   └── utils.ts         # Utilidades
├── workers/
│   ├── pipeline.worker.ts # Web Worker batch+dedup
│   └── useWorkerPipeline.ts
├── types/
│   └── contact.ts       # Interfaces principales
├── pages/
│   ├── Index.tsx        # Página principal (6 tabs)
│   ├── Landing.tsx      # Landing page SEO
│   ├── Privacy.tsx      # Política de privacidad
│   ├── Terms.tsx        # Términos de servicio
│   └── NotFound.tsx     # 404
└── integrations/
    └── supabase/
        ├── client.ts    # Cliente Supabase
        └── types.ts     # Tipos DB

supabase/
├── config.toml
└── functions/
    ├── clean-contacts/index.ts     # Edge Function: limpieza IA
    └── google-contacts-auth/       # Edge Function: OAuth Google
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
- Historial/Undo con snapshots
- Keyboard shortcuts (1-6 tabs, D tema, S modo, ? ayuda)

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
4. **IA Limpieza:** Solo contactos que las reglas no resolvieron (batch 20-25)
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
- Rate limiting: 30 req/min/IP en Edge Function

---

## 6. Análisis Multidisciplinario (36 Roles)

### Área Técnica

#### 🏗️ Software Architect
**Veredicto:** ⭐⭐⭐⭐ — Arquitectura sólida, bajo acoplamiento
- **Fortaleza:** Separación clara entre UI (React), lógica (hooks), datos (IndexedDB) y procesamiento IA (Edge Functions)
- **Fortaleza:** Pipeline desacoplado con stages independientes
- **Debilidad:** `useContactProcessing.ts` tiene 407 líneas — viola Single Responsibility
- **Debilidad:** Sin circuit breaker formal para proveedores IA (solo rotación simple)
- **Plan:**
  - [ ] Extraer lógica de IA a `useAIPipeline.ts` (~150 líneas)
  - [ ] Extraer lógica de dedup a `useDedup.ts` (~80 líneas)
  - [ ] Implementar circuit breaker con estados (closed/open/half-open)

#### ☁️ Cloud Architect
**Veredicto:** ⭐⭐⭐ — Funcional pero con cuellos de botella
- **Fortaleza:** Edge Functions en Deno = cold start mínimo, escala automática
- **Fortaleza:** Deploy en Hostinger funciona, con rollback automático
- **Debilidad:** Hostinger compartido es cuello de botella (sin CDN, sin HTTP/2 garantizado)
- **Debilidad:** Rate limiting in-memory en Edge Function no sobrevive restart
- **Plan:**
  - [ ] Cloudflare CDN (gratis) — guía ya lista en `Documents/CLOUDFLARE_SETUP.md`
  - [ ] Migrar rate limiting a Supabase DB (cross-instance)
  - [ ] Futuro: migrar a Vercel/Cloudflare Pages para mejor rendimiento

#### 💻 Backend Developer
**Veredicto:** ⭐⭐⭐⭐ — Edge Function robusta
- **Fortaleza:** Rate limiting con sliding window, CORS whitelist, JWT verification
- **Fortaleza:** Manejo de errores con fallback entre proveedores
- **Debilidad:** Rate limit in-memory se pierde en restart
- **Debilidad:** Prompts hardcodeados en Edge Function (deberían ser configurables)
- **Plan:**
  - [ ] Rate limit en Supabase DB
  - [ ] Extraer prompts a configuración externa
  - [ ] Retry con backoff exponencial en llamadas IA

#### 🎨 Frontend Developer
**Veredicto:** ⭐⭐⭐⭐ — Código limpio, shadcn/ui consistente
- **Fortaleza:** TypeScript estricto, componentes bien estructurados
- **Fortaleza:** Tabla virtualizada para rendimiento con grandes datasets
- **Debilidad:** `useContactProcessing.ts` (407 líneas) necesita dividirse
- **Debilidad:** Sin lazy loading de rutas (solo de xlsx)
- **Plan:**
  - [ ] Dividir hook en 3 sub-hooks
  - [ ] React.lazy para rutas (Privacy, Terms, Landing)
  - [ ] Memoización de componentes pesados

#### 📱 iOS Developer
**Veredicto:** ⭐⭐⭐ — PWA funcional
- **Fortaleza:** PWA manifest + service worker implementados
- **Debilidad:** Sin iOS standalone mode detection
- **Debilidad:** Sin push notifications
- **Plan:**
  - [ ] Detectar `window.navigator.standalone` para iOS
  - [ ] Optimizar splash screen para iOS

#### 📱 Android Developer
**Veredicto:** ⭐⭐⭐ — PWA funcional
- **Fortaleza:** PWA installable en Android
- **Debilidad:** Sin `beforeinstallprompt` handler
- **Plan:**
  - [ ] Capturar evento `beforeinstallprompt` para prompt nativo

#### ⚙️ DevOps Engineer
**Veredicto:** ⭐⭐⭐⭐ — CI/CD con rollback automático
- **Fortaleza:** Pipeline completo: lint → test → build → deploy → smoke test → rollback
- **Fortaleza:** Backup automático pre-deploy
- **Debilidad:** Sin staging environment
- **Debilidad:** Sin feature flags
- **Plan:**
  - [ ] Staging branch con deploy separado
  - [ ] Feature flags simples (localStorage + env var)

#### 🔒 SRE
**Veredicto:** ⭐⭐⭐ — Mejorado recientemente
- **Fortaleza:** Error Reporter v2 + health endpoint + uptime cron
- **Debilidad:** Sin Sentry ni herramienta de error tracking profesional
- **Debilidad:** Sin métricas de rendimiento (p95, p99)
- **Plan:**
  - [ ] Integrar Sentry (free tier: 5K events/mes)
  - [ ] Performance budget en CI

#### 🔐 Cybersecurity Architect
**Veredicto:** ⭐⭐⭐⭐ — Sólido
- **Fortaleza:** CSP headers, JWT verification, input validation, XSS protection
- **Fortaleza:** CORS whitelist, rate limiting, privacy-first architecture
- **Debilidad:** API keys en localStorage sin encriptar
- **Debilidad:** Sin Cloudflare WAF
- **Plan:**
  - [ ] Encriptar API keys con Web Crypto API
  - [ ] Cloudflare WAF (gratis)
  - [ ] Cookie consent banner si se usa analytics

#### 📊 Data Engineer
**Veredicto:** ⭐⭐⭐ — IndexedDB local
- **Fortaleza:** IndexedDB v3 con cursor batched (5K por iteración) — maneja 50K+ contactos
- **Fortaleza:** Índices por email, whatsapp, source
- **Debilidad:** Sin persistencia server-side (datos se pierden al limpiar browser)
- **Plan:**
  - [ ] Export/import de IndexedDB como backup
  - [ ] Futuro: sync parcial a Supabase DB

#### 🤖 ML Engineer
**Veredicto:** ⭐⭐⭐ — Prompts hardcodeados
- **Fortaleza:** 12 proveedores IA con rotación automática
- **Fortaleza:** Pipeline híbrido reglas+IA es eficiente
- **Debilidad:** Prompts hardcodeados, sin A/B testing
- **Debilidad:** Sin embeddings para dedup semántica
- **Plan:**
  - [ ] Extraer prompts a configuración externa
  - [ ] Futuro: embeddings para dedup semántica avanzada

#### 🧪 QA Automation Engineer
**Veredicto:** ⭐⭐⭐ — 174 tests, sin E2E en CI
- **Fortaleza:** 174 tests unitarios pasando
- **Fortaleza:** Playwright configurado para E2E
- **Debilidad:** E2E tests no corren en CI (solo unit)
- **Debilidad:** Sin visual regression testing
- **Plan:**
  - [ ] Agregar Playwright a GitHub Actions
  - [ ] Visual regression con Playwright screenshots

#### 🗄️ DBA
**Veredicto:** ⭐⭐⭐ — IndexedDB v3 bien diseñada
- **Fortaleza:** Cursor batched para datasets grandes
- **Fortaleza:** Índices por campos de búsqueda frecuentes
- **Debilidad:** Sin TTL para snapshots de historial
- **Plan:**
  - [ ] TTL de 30 días para snapshots
  - [ ] Limpieza automática de historial viejo

### Área de Producto y Gestión

#### 📋 Product Manager
**Veredicto:** ⭐⭐⭐ — Feature-complete pero sin tracción
- **Fortaleza:** Producto completo con pipeline real
- **Debilidad:** Sin funnel de conversión definido
- **Debilidad:** Sin métricas de uso
- **Plan:**
  - [ ] Definir activation funnel: visit → import → clean → export
  - [ ] Analytics sin PII (Plausible/Umami)

#### 🎯 Product Owner
**Veredicto:** ⭐⭐⭐⭐ — Backlog bien priorizado
- **Fortaleza:** Features bien definidas por etapa
- **Fortaleza:** Priorización clara (core → security → UX → growth)
- **Plan:**
  - [ ] User stories para v11 (monetización)

#### 🏃 Scrum Master / Agile Coach
**Veredicto:** ⭐⭐⭐ — Desarrollo en sprints implícitos
- **Debilidad:** Sin board público ni retrospectivas
- **Plan:**
  - [ ] GitHub Projects board (Kanban)
  - [ ] Retrospectives periódicas

#### 🔍 UX Researcher
**Veredicto:** ⭐⭐ — Sin datos de uso real
- **Debilidad:** No hay analytics, no se sabe qué módulos se usan más
- **Plan:**
  - [ ] Analytics sin PII
  - [ ] Feedback in-app (thumbs up/down en resultados)

#### 🎨 UX Designer
**Veredicto:** ⭐⭐⭐⭐ — Onboarding wizard + modo simple
- **Fortaleza:** Onboarding wizard de 3 pasos
- **Fortaleza:** Modo simple/avanzado para diferentes niveles de usuario
- **Fortaleza:** Pipeline visualizer muestra progreso en tiempo real
- **Plan:**
  - [ ] A/B test wizard vs. tutorial

#### ✍️ UX Writer
**Veredicto:** ⭐⭐⭐⭐ — Copy claro en español
- **Fortaleza:** Microcopy consistente, tooltips informativos
- **Plan:**
  - [ ] Audit de microcopy en todos los flujos

#### 🌍 Localization Manager
**Veredicto:** ⭐⭐⭐ — i18n ES/EN/PT
- **Fortaleza:** 3 idiomas soportados
- **Debilidad:** Traducciones incompletas en algunos paths
- **Plan:**
  - [ ] Completar traducciones pendientes
  - [ ] Auto-detección de idioma del browser

#### 📦 Delivery Manager
**Veredicto:** ⭐⭐⭐⭐ — Deploy automático con rollback
- **Fortaleza:** CI/CD completo con smoke test y rollback
- **Plan:**
  - [ ] Feature flags para rollouts graduales

### Área Comercial y de Crecimiento

#### 📈 Growth Manager
**Veredicto:** ⭐⭐ — Sin funnel definido
- **Debilidad:** Sin estrategia de adquisición
- **Plan:**
  - [ ] Landing page SEO optimizada (ya existe)
  - [ ] Product Hunt launch
  - [ ] Blog con keywords objetivo

#### 🎯 ASO Specialist
**Veredicto:** N/A — web app
- PWA install prompt como alternativa

#### 📊 Performance Marketing Manager
**Veredicto:** ⭐ — Sin presupuesto
- **Plan:**
  - [ ] SEO orgánico como canal principal

#### 🔍 SEO Specialist
**Veredicto:** ⭐⭐⭐ — OG tags + Schema.org
- **Fortaleza:** Landing page con OG tags y Schema.org
- **Debilidad:** Sin blog ni backlinks
- **Plan:**
  - [ ] Blog con 3 artículos clave: "limpiar contactos", "deduplicar CSV", "unificar agenda"
  - [ ] Backlinks desde blogs de tecnología

#### 🤝 Business Development Manager
**Veredicto:** ⭐⭐ — Sin partnerships
- **Plan:**
  - [ ] Integraciones con CRMs (HubSpot, Pipedrive)
  - [ ] Partnerships con blogs de productividad

#### 👥 Account Manager
**Veredicto:** N/A — proyecto open source sin usuarios B2B

#### 📝 Content Manager
**Veredicto:** ⭐⭐ — Sin contenido
- **Plan:**
  - [ ] 3 artículos SEO
  - [ ] Video tutorial en YouTube

#### 💬 Community Manager
**Veredicto:** ⭐ — Sin presencia social
- **Plan:**
  - [ ] Twitter/X presencia
  - [ ] Product Hunt launch

### Área de Operaciones, Legal y Análisis

#### 📊 BI Analyst
**Veredicto:** ⭐⭐ — Analytics básico (localStorage)
- **Plan:**
  - [ ] Migrar a Plausible/Umami (GDPR-safe)

#### 🔬 Data Scientist
**Veredicto:** ⭐ — Sin datos de usuarios
- **Plan:**
  - [ ] Event tracking: funnel conversion rates

#### ⚖️ Legal & Compliance Officer
**Veredicto:** ⭐⭐⭐⭐ — Privacy + Terms implementados
- **Fortaleza:** Privacy Policy y Terms of Service en la app
- **Debilidad:** Cookie consent si se usa analytics
- **Plan:**
  - [ ] Cookie consent banner

#### 🔒 DPO
**Veredicto:** ⭐⭐⭐⭐ — GDPR compliant
- **Fortaleza:** Datos procesados en cliente, no en servidor
- **Fortaleza:** Sin recopilación de PII
- **Plan:**
  - [ ] Data retention policy documentada

#### 🎧 Customer Success Manager
**Veredicto:** ⭐⭐ — Sin canal de soporte
- **Plan:**
  - [ ] FAQ + Help Center
  - [ ] Chat widget (Crisp/Tawk.to)

#### 🛠️ Technical Support (Tier 1, 2, 3)
**Veredicto:** ⭐⭐ — Sin base de conocimiento
- **Tier 1:** README + Issues
- **Tier 2:** Sin guía avanzada
- **Tier 3:** GitHub Issues como ticketing técnico ✅
- **Plan:**
  - [ ] FAQ con troubleshooting guide
  - [ ] Template responses para issues comunes

#### 💰 Revenue Operations (RevOps)
**Veredicto:** ⭐ — Sin revenue
- **Plan:**
  - [ ] Definir pricing antes de monetizar (Free vs Pro)

---

## 7. Plan Optimizado por Etapas

### ✅ Etapas Completadas (v1.0 → v10.5)

| Etapa | Descripción | Versión | Fecha |
|-------|------------|---------|-------|
| Core | Pipeline IA completo, dedup, exportación | v3.0 | 2026-04-22 |
| Security | CSP, JWT, input validation, ErrorBoundary | v6.0 | 2026-04-24 |
| UX | Onboarding wizard, modo simple, preview, skeletons | v7.0 | 2026-04-24 |
| Performance | PWA, Web Worker, CDN guide, rollback deploy | v8.0 | 2026-04-24 |
| Testing | E2E Playwright, coverage, a11y, performance budget | v9.0 | 2026-04-24 |
| Growth | Landing page, SEO, i18n, fine-tuning JSONL | v10.0 | 2026-04-24 |
| Monitoreo | Error reporter v2, health endpoint, uptime cron | v10.3 | 2026-04-28 |
| Fixes | UTF-8 CSV, regex column mapper, historial snapshot | v10.2 | 2026-04-28 |
| UX Personal | Keyboard shortcuts, SimpleMode fix | v10.5 | 2026-04-28 |

### 📋 ETAPA 11 — Hardening Técnico (Completada)

| # | Tarea | Rol | Prioridad | Estado |
|---|-------|-----|-----------|--------|
| 11.1 | Verificar funcionalidad en producción | SRE, QA | 🔴 Crítica | ✅ Verificado |
| 11.2 | Test pipeline completo con CSV real | QA | 🔴 Crítica | ✅ 27 contactos, 12 dup |
| 11.3 | Verificar proveedores IA con keys reales | Backend Dev | 🟡 Alta | ✅ 2/12 (Groq, Cerebras) |
| 11.4 | Error reporter v2 + health endpoint | SRE | 🟡 Alta | ✅ Completado |
| 11.5 | Uptime check (cron cada 5 min) | DevOps | 🟡 Alta | ✅ Completado |
| 11.6 | Fix: Encoding UTF-8 CSV (BOM + mojibake) | Frontend | 🟡 Alta | ✅ v10.2 |
| 11.7 | Fix: Regex column mapper con acentos | Frontend | 🟡 Alta | ✅ v10.2 |
| 11.8 | Fix: Historial snapshot pre-proceso | Backend | 🟡 Alta | ✅ v10.2 |
| 11.9 | Keyboard shortcuts (1-6, D, S, ?) | Frontend | 🟢 Media | ✅ v10.5 |
| 11.10 | SimpleMode fix (ProcessingPanel integrado) | Frontend | 🟢 Media | ✅ v10.5 |
| 11.11 | Fix: Declaración duplicada en Edge Function | Backend Dev | 🔴 Crítica | ✅ v10.6 |

### 📋 ETAPA 12 — Estabilización y Observabilidad (Sprint actual)

| # | Tarea | Rol | Complejidad | Prioridad | Estado |
|---|-------|-----|-------------|-----------|--------|
| 12.1 | **Dividir useContactProcessing (407→3 hooks)** | Software Architect | Media | 🔴 Alta | ⏳ |
| 12.2 | **Sentry para errores de producción** | SRE | Baja | 🔴 Alta | ⏳ |
| 12.3 | **Rate limit en Supabase DB (cross-instance)** | Backend Dev | Media | 🟡 Alta | ⏳ |
| 12.4 | **Playwright E2E en GitHub Actions** | QA Automation | Media | 🟡 Alta | ⏳ |
| 12.5 | Cloudflare CDN (gratis) | Cloud Architect | Baja | 🟡 Alta | ⏳ |
| 12.6 | Encriptar API keys con Web Crypto API | Cybersecurity | Media | 🟡 Alta | ⏳ |
| 12.7 | 3er proveedor IA verificado (para pipeline completo) | Backend Dev | Baja | 🟡 Alta | ⏳ |
| 12.8 | Gemini key: verificar activación | Backend Dev | Baja | 🟢 Media | ⏳ |
| 12.9 | Deploy Edge Functions (log-error + clean-contacts) | DevOps | Baja | 🟢 Media | ⏳ |
| 12.10 | React.lazy para rutas secundarias | Frontend | Baja | 🟢 Media | ⏳ |
| 12.11 | TTL de 30 días para snapshots de historial | DBA | Baja | 🟢 Media | ⏳ |

### 📋 ETAPA 13 — Crecimiento y Monetización (Sprint 2)

| # | Tarea | Rol | Complejidad | Prioridad | Estado |
|---|-------|-----|-------------|-----------|--------|
| 13.1 | **Analytics: Plausible/Umami (GDPR-safe)** | BI Analyst | Baja | 🟡 Alta | ⏳ |
| 13.2 | **Funnel tracking: visit → import → clean → export** | Growth Manager | Media | 🟡 Alta | ⏳ |
| 13.3 | **Pricing page: Free vs Pro** | Product Manager | Media | 🟡 Alta | ⏳ |
| 13.4 | Límites Free: 500 contacts/lote, 3 lotes/día | Backend Dev | Media | 🟡 Alta | ⏳ |
| 13.5 | Blog SEO: 3 artículos clave | Content Manager | Baja | 🟡 Alta | ⏳ |
| 13.6 | Product Hunt launch | Growth Manager | Baja | 🟡 Alta | ⏳ |
| 13.7 | Cookie consent banner | Legal, Frontend | Baja | 🟢 Media | ⏳ |
| 13.8 | FAQ + Help Center | Customer Success | Baja | 🟢 Media | ⏳ |
| 13.9 | Feedback in-app (thumbs up/down) | UX Researcher | Baja | 🟢 Media | ⏳ |

### 📋 ETAPA 14 — Escala (Sprint 3+)

| # | Tarea | Rol | Complejidad | Prioridad | Estado |
|---|-------|-----|-------------|-----------|--------|
| 14.1 | Circuit breaker formal para proveedores IA | Software Architect | Alta | 🟢 Media | ⏳ |
| 14.2 | Prompts configurables (no hardcodeados) | ML Engineer | Media | 🟢 Media | ⏳ |
| 14.3 | Twitter/X presencia + comunidad | Community Manager | Baja | 🟢 Media | ⏳ |
| 14.4 | Integraciones CRM (HubSpot, Pipedrive) | Business Dev | Alta | 🔵 Futuro | ⏳ |
| 14.5 | Embeddings para dedup semántica | ML Engineer | Alta | 🔵 Futuro | ⏳ |
| 14.6 | Migración parcial a Supabase DB | Data Engineer | Alta | 🔵 Futuro | ⏳ |
| 14.7 | App nativa iOS/Android | Mobile Devs | Alta | 🔵 Futuro | ⏳ |

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
  6. npm run build
  7. Smoke test: dist/index.html exists
  8. SSH: backup current → clean assets/
  9. SCP: dist/* → Hostinger
  10. Post-deploy: curl HTTP 200 check
  11. On failure: auto-rollback from backup
```

### Deploy Edge Functions (manual)

```bash
npx supabase login --token sbp_XXXXX
npx supabase link --project-ref tzatuvxatsduuslxqdtm
npx supabase functions deploy clean-contacts
npx supabase functions deploy google-contacts-auth
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
| Rate limiting | ✅ | 30 req/min/IP en Edge Function |
| API keys | ✅ | En localStorage del usuario, nunca en repo |
| ErrorBoundary | ✅ | React Error Boundary global |
| Privacy Policy | ✅ | /privacy — GDPR-compliant |
| Terms of Service | ✅ | /terms |
| .env protection | ✅ | En .gitignore |

### Pendientes

- ⏳ Sentry para errores de producción
- ⏳ Cloudflare WAF
- ⏳ Cookie consent banner
- ⏳ npm audit blocking en CI
- ⏳ Encriptar API keys en localStorage (Web Crypto API)

---

## 10. Registro de Cambios

| Versión | Fecha | Cambios principales |
|---------|-------|-------------------|
| v10.6 | 2026-04-29 | Fix crítico: declaración duplicada en Edge Function clean-contacts, consolidación documentación |
| v10.5 | 2026-04-28 | Keyboard shortcuts, SimpleMode fix (ProcessingPanel integrado) |
| v10.4 | 2026-04-28 | Cerebras modelo actualizado (llama3.1-8b), proveedores verificados |
| v10.3 | 2026-04-28 | Monitoreo: error reporter v2, health endpoint, uptime cron |
| v10.2 | 2026-04-28 | Fix 3 bugs: encoding UTF-8 CSV, regex column mapper, historial snapshot |
| v10.1 | 2026-04-28 | Documentación consolidada en MASTERPLAN.md único |
| v10.0 | 2026-04-24 | Landing page, SEO, i18n, fine-tuning JSONL |
| v9.0 | 2026-04-24 | E2E Playwright, coverage, a11y, perf budget |
| v8.0 | 2026-04-24 | PWA, Web Worker, CDN guide, rollback deploy |
| v7.0 | 2026-04-24 | Onboarding wizard, modo simple, preview, skeletons |
| v6.0 | 2026-04-24 | CSP headers, JWT, input validation, Privacy/Terms |
| v5.0 | 2026-04-24 | Health Check, Historial/Undo |
| v4.5 | 2026-04-24 | Limpieza proveedor "lovable" obsoleto |
| v4.4 | 2026-04-24 | Fix anon key + modelo OpenRouter |
| v4.3 | 2026-04-24 | Migración Supabase propio |
| v4.0 | 2026-04-23 | Hardening: Worker, lazy xlsx, a11y, rate limit |
| v3.0 | 2026-04-22 | Core completo: pipeline IA, dedup, exportación |

---

## 11. Archivos Clave

| Archivo | Qué hace | Líneas |
|---------|----------|--------|
| `src/hooks/useContactProcessing.ts` | Lógica central del pipeline | 407 |
| `src/lib/providers.ts` | Config de 12 proveedores IA | 29 |
| `src/lib/db.ts` | IndexedDB v3 | 228 |
| `src/lib/dedup.ts` | Deduplicación O(n) + Jaro-Winkler | 227 |
| `src/lib/rule-cleaner.ts` | Limpieza determinística | 166 |
| `src/lib/ai-validator.ts` | Validación IA con cache | 231 |
| `src/lib/field-validator.ts` | Validación semántica de campos | 280 |
| `src/lib/column-mapper.ts` | Auto-detección de columnas | 45 |
| `src/lib/export-utils.ts` | Exportación 6 formatos | 250 |
| `src/components/ColumnMapper.tsx` | UI mapeo de columnas | 171 |
| `src/pages/Index.tsx` | Página principal (6 tabs) | 324 |
| `src/workers/pipeline.worker.ts` | Web Worker para batch+dedup | 200 |
| `supabase/functions/clean-contacts/index.ts` | Edge Function: limpieza IA | 550 |
| `Documents/MASTERPLAN.md` | Este archivo (doc principal) | — |

---

## 12. Comandos Rápidos

```bash
# Desarrollo
cd MejoraContactos && npm install --legacy-peer-deps && npm run dev

# Tests
npx vitest run                    # 174 tests

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
*Última actualización: 2026-04-29 06:15 GMT+8 — 174 tests · v10.6 · 12 proveedores IA · Pipeline híbrido*
