# 📋 MejoraContactos — Documento Maestro

> **⚡ INSTRUCCIÓN:** Cuando el usuario diga **"documentar"**, actualizar este archivo con el estado actual del proyecto, trabajos realizados, pendientes y cualquier cambio relevante. Todos los documentos viven en `Documents/`.

**Última actualización:** 2026-05-01 03:15 GMT+8
**Versión actual:** v12.1
**Repo:** [pabloeckert/MejoraContactos](https://github.com/pabloeckert/MejoraContactos)
**Live:** https://util.mejoraok.com/mejoracontactos/
**Tests:** 199 pasando ✅ | E2E: 21 pasando ✅ | Build: OK ✅ | Lint: 0 errores ✅

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

**Estado actual:** ✅ BETA — Funcional y en producción

**Diferenciadores clave:**
- 12 proveedores IA con rotación automática y retry con backoff exponencial
- Pipeline híbrido: reglas (80%) + IA (20%) = rápido + inteligente
- Gratuito (el usuario paga solo la API que usa)
- Privacy-first: todo procesa en el browser del usuario
- Multi-formato: 5 formatos de entrada, 6 de salida
- API keys cifradas con AES-GCM en localStorage
- GDPR compliant: privacy policy, terms, cookie consent, data retention

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
| Deploy Edge Functions | Supabase CLI |
| Supabase project | `tzatuvxatsduuslxqdtm` |
| Analytics | Plausible (GDPR-safe) + localStorage events |

### Arquitectura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   GitHub        │────▶│  GitHub Actions   │────▶│  Hostinger VPS  │
│   (source)      │     │  (CI/CD + E2E)    │     │  (SSH/SCP)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘

┌─────────────────┐     ┌──────────────────┐
│  Browser        │────▶│  Supabase Edge   │
│  (React SPA)    │     │  Functions (Deno)│
│  (IndexedDB)    │     └──────────────────┘
└─────────────────┘
```

---

## 3. Funcionalidades

### ✅ Funcional (sin configurar nada)
- Importación: CSV, Excel, VCF, JSON
- Mapeo automático de columnas (ES/EN)
- Limpieza por reglas determinísticas (80%+)
- Deduplicación O(n) con Jaro-Winkler
- Validación semántica por campo (0-100)
- Exportación: CSV, Excel, VCF, JSON, JSONL, HTML
- Dashboard con métricas en tiempo real
- Historial/Undo con snapshots (TTL 30 días)
- Onboarding wizard (3 pasos)
- Modo simple/avanzado
- Dark mode
- Keyboard shortcuts
- PWA installable
- FAQ / Help Center
- Privacy Policy + Terms of Service
- Cookie consent banner

### ⚡ Con API key (gratis)
- Limpieza con IA (12 proveedores)
- Pipeline 3 etapas: limpiar → verificar → corregir
- Validación IA para campos ambiguos
- Health check de proveedores

### 🔧 Configuración adicional
- Google Contacts import (OAuth)
- Sentry error tracking
- Cloudflare CDN

---

## 4. Pipeline de Procesamiento

```
Parseo → Mapeo → Reglas (80%) → IA Limpieza → IA Verificación → IA Corrección → Validación → Dedup
```

---

## 5. Proveedores IA

| # | ID | Proveedor | Modelo | Estado |
|---|-----|----------|--------|--------|
| 1 | groq | Groq Cloud | llama-3.3-70b-versatile | ✅ Verificado |
| 2 | cerebras | Cerebras | llama3.1-8b | ✅ Verificado |
| 3 | deepseek | DeepSeek | deepseek-chat | ⚠️ Sin saldo |
| 4 | gemini | Google AI Studio | gemini-2.0-flash | ⚠️ Pendiente activación |
| 5-12 | openrouter, together, deepinfra, sambanova, mistral, cloudflare, huggingface, nebius | — | — | ⏳ Sin key |

**Configuración:** Rotación automática, multi-key, retry exponencial, rate limit 30 req/min/IP

---

## 6. Análisis Multidisciplinario (36 Roles)

### Resumen por área

| Área | Promedio | Estado |
|------|----------|--------|
| Técnica (13 roles) | ⭐⭐⭐⭐½ | Sólido: hooks divididos, keys cifradas, E2E CI, retry backoff |
| Producto y Gestión (8 roles) | ⭐⭐⭐⭐ | Completo: onboarding, FAQ, pricing, blog |
| Comercial y Crecimiento (8 roles) | ⭐⭐⭐ | SEO + landing + blog. Falta comunidad |
| Operaciones, Legal y Análisis (7 roles) | ⭐⭐⭐⭐ | GDPR compliant. Falta Sentry |

### Roles destacados

- **Software Architect** ⭐⭐⭐⭐⭐ — Hooks divididos en 3, pipeline desacoplado
- **Cybersecurity** ⭐⭐⭐⭐⭐ — Keys AES-GCM, CSP, JWT, privacy-first
- **DevOps** ⭐⭐⭐⭐⭐ — CI/CD con E2E, staging, rollback, Dependabot
- **QA Automation** ⭐⭐⭐⭐⭐ — 199 unit + 21 E2E tests
- **DPO/Legal** ⭐⭐⭐⭐⭐ — GDPR completo: privacy, terms, cookies, data retention

---

## 7. Plan Optimizado por Etapas

### ✅ Etapas 1-13 Completadas

| Etapa | Descripción | Versión | Tests |
|-------|------------|---------|-------|
| Core | Pipeline IA, dedup, exportación | v3.0 | — |
| Security | CSP, JWT, input validation | v6.0 | — |
| UX | Onboarding, modo simple, preview | v7.0 | — |
| Performance | PWA, Web Worker, rollback deploy | v8.0 | — |
| Testing | E2E Playwright, coverage | v9.0 | — |
| Growth | Landing, SEO, i18n | v10.0 | 174 |
| Hardening | Fixes, monitoreo, shortcuts | v10.5 | 174 |
| **Estabilización** | **Hooks, keys, E2E CI, rate limit** | **v11.0** | **180** |
| **Crecimiento** | **Pricing, blog, analytics, free tier** | **v12.0** | **199** |

### 📋 Pendientes (requieren acción del usuario)

| # | Tarea | Prioridad | Acción |
|---|-------|-----------|--------|
| 1 | Migration SQL rate_limits | 🟡 Alta | Ejecutar SQL en Supabase Dashboard |
| 2 | Deploy Edge Functions actualizadas | 🟡 Alta | `npx supabase functions deploy clean-contacts` |
| 3 | Sentry error tracking | 🟢 Media | Crear cuenta en sentry.io, pasar DSN |
| 4 | Cloudflare CDN | 🟢 Media | Cambiar nameservers en Hostinger |
| 5 | Activar 3er proveedor IA | 🟢 Media | Activar key Gemini/OpenRouter |
| 6 | Product Hunt launch | 🔵 Futuro | Publicar |
| 7 | Twitter/X presencia | 🔵 Futuro | Crear cuenta |

---

## 8. Infraestructura y Deploy

### URLs

| URL | Descripción |
|-----|------------|
| https://util.mejoraok.com/mejoracontactos/ | **App principal** |
| https://util.mejoraok.com/mejoracontactos/landing/ | Landing page |
| https://util.mejoraok.com/mejoracontactos/faq/ | FAQ |
| https://util.mejoraok.com/mejoracontactos/privacy/ | Privacidad |
| https://util.mejoraok.com/mejoracontactos/terms/ | Términos |

### CI/CD

```yaml
Trigger: push to main
Steps:
  1. npm ci --legacy-peer-deps
  2. npm test (199 tests)
  3. npx playwright install --with-deps chromium
  4. npx playwright test (21 E2E tests)
  5. npm run build
  6. Performance budget check
  7. Smoke test: dist/index.html
  8. SSH backup → SCP deploy → HTTP 200 check
  9. On failure: auto-rollback
```

---

## 9. Seguridad

| Control | Estado |
|---------|--------|
| CSP headers | ✅ |
| JWT verification | ✅ |
| Input validation (10K max) | ✅ |
| XSS protection | ✅ |
| CORS whitelist | ✅ |
| Rate limiting (Supabase DB) | ✅ (código, pendiente migration SQL) |
| API keys AES-GCM | ✅ |
| ErrorBoundary | ✅ |
| Privacy Policy | ✅ |
| Terms of Service | ✅ |
| Cookie consent | ✅ |
| Data retention policy | ✅ |
| SECURITY.md | ✅ |
| .env protection | ✅ |

---

## 10. Registro de Cambios

| Versión | Fecha | Cambios |
|---------|-------|---------|
| v12.1 | 2026-05-01 | Edge Function modernizada (Deno.serve), type safety fix, version sync |
| v12.0 | 2026-04-29 | Etapa 13: pricing BYOK, blog SEO, free tier, Plausible analytics, funnel tracking, E2E fixes |
| v11.0 | 2026-04-29 | Etapa 12: hooks divididos, keys cifradas, E2E CI, rate limit DB, retry backoff, cookie consent, FAQ, PWA install |
| v10.6 | 2026-04-29 | Fix Edge Function duplicada, consolidación docs |
| v10.5 | 2026-04-28 | Keyboard shortcuts, SimpleMode fix |
| v10.0 | 2026-04-24 | Landing, SEO, i18n |
| v9.0 | 2026-04-24 | E2E Playwright, coverage |
| v8.0 | 2026-04-24 | PWA, Web Worker, rollback deploy |
| v7.0 | 2026-04-24 | Onboarding wizard, modo simple |
| v6.0 | 2026-04-24 | CSP, JWT, input validation |
| v3.0 | 2026-04-22 | Core completo |

---

## 11. Archivos Clave

| Archivo | Qué hace |
|---------|----------|
| `src/hooks/useContactProcessing.ts` | Orquestador pipeline |
| `src/hooks/useAIPipeline.ts` | Lógica IA + validación |
| `src/hooks/useDedup.ts` | Deduplicación Web Workers |
| `src/lib/api-keys.ts` | Keys cifradas AES-GCM |
| `src/lib/db.ts` | IndexedDB + TTL 30 días |
| `src/lib/analytics.ts` | Analytics locales + Plausible |
| `src/lib/feature-flags.ts` | Feature flags |
| `supabase/functions/clean-contacts/index.ts` | Edge Function IA |
| `Documents/MASTERPLAN.md` | Este archivo |

---

## 12. Comandos Rápidos

```bash
npm install --legacy-peer-deps && npm run dev   # Desarrollo
npx vitest run                                   # 199 tests
npx playwright test                              # 21 E2E tests
npx vite build                                   # Build producción
git push origin main                             # Deploy automático
```

---

## 13. Convenciones

- **Idioma:** UI en español, código en inglés
- **"documentar":** Actualiza este MASTERPLAN.md con el estado actual
- **Commits:** `tipo: descripción` (feat, fix, docs, chore, ci, perf)
- **Branch:** `main` (deploy automático), `staging` (pre-release)
- **NO commitear:** `.env`, tokens, API keys

---

*Documento maestro — Actualizar al decir "documentar".*
*2026-05-01 03:15 GMT+8 — 199 tests · 21 E2E · v12.1 · 12 proveedores IA · Pipeline híbrido · GDPR · BETA*
