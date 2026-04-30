# 📋 MejoraContactos — PLAN GENERAL

> **Última sesión:** Sesión 1 — 2026-05-01 03:12 GMT+8
> **Versión:** v12.0
> **Estado:** ✅ BETA — Producción activa

---

## Estado Actual

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| **Funcionalidad** | ✅ Completo | Pipeline híbrido (reglas + IA), 12 proveedores, 6 formatos exportación |
| **Tests** | ✅ 199 unit + 21 E2E | Todos pasando, coverage 70%+ |
| **Build** | ✅ OK | Vite 5, chunks optimizados, budget < 2MB |
| **Lint** | ✅ 0 errores | 4 warnings pre-existentes (no críticos) |
| **Deploy** | ✅ Automático | GitHub Actions → SCP → Hostinger, rollback incluido |
| **Seguridad** | ✅ Sólido | AES-GCM, CSP, JWT, rate limiting, CORS whitelist |
| **Performance** | ✅ Optimizado | Web Workers, chunk splitting, lazy loading, virtualización |
| **UX** | ✅ Completo | Onboarding, dark mode, keyboard shortcuts, responsive |
| **Legal** | ✅ GDPR | Privacy policy, terms, cookies, data retention |
| **Edge Function** | ✅ Modernizado | Deno.serve(), type-safe, 12 proveedores con rotación |

---

## Roadmap Vivo

### ✅ Completado (Etapas 1-13)

| Etapa | Versión | Tests | Highlights |
|-------|---------|-------|-----------|
| Core | v3.0 | — | Pipeline IA, dedup, exportación |
| Security | v6.0 | — | CSP, JWT, input validation |
| UX | v7.0 | — | Onboarding, modo simple, preview |
| Performance | v8.0 | — | PWA, Web Worker, rollback deploy |
| Testing | v9.0 | — | E2E Playwright, coverage |
| Growth | v10.0 | 174 | Landing, SEO, i18n |
| Hardening | v10.5 | 174 | Fixes, monitoreo, shortcuts |
| Estabilización | v11.0 | 180 | Hooks divididos, keys cifradas, E2E CI |
| Crecimiento | v12.0 | 199 | Pricing, blog, analytics, free tier |
| **Sesión 1** | **v12.1** | **199** | **Edge Function modernizado, type safety, version sync** |

### 📋 Pendientes de Usuario

| # | Tarea | Prioridad | Acción |
|---|-------|-----------|--------|
| 1 | Migration SQL rate_limits | 🟡 Alta | Ejecutar SQL en Supabase Dashboard |
| 2 | Deploy Edge Functions actualizadas | 🟡 Alta | `npx supabase functions deploy clean-contacts` |
| 3 | Sentry error tracking | 🟢 Media | Crear cuenta en sentry.io, pasar DSN |
| 4 | Cloudflare CDN | 🟢 Media | Cambiar nameservers en Hostinger |
| 5 | Activar 3er proveedor IA | 🟢 Media | Activar key Gemini/OpenRouter |

---

## Próximas Micro-Misiones (ordenadas por impacto)

### 🥇 Opción 1: Unified Error Handling + Sentry Ready (Prioridad: Seguridad)
**Tiempo estimado:** 25 min
**Impacto:** ALTO — Mejor observabilidad en producción
- Crear `src/lib/error-handler.ts` centralizado
- Reemplazar try-catch dispersos por handler unificado
- Integrar `captureError()` existente en puntos críticos del pipeline
- Agregar error boundaries granulares por sección (ProcessingPanel, ExportPanel)
- Tests para error handling paths

### 🥈 Opción 2: Performance — Lazy Load Heavy Dependencies (Prioridad: Performance)
**Tiempo estimado:** 20 min
**ImpactO:** ALTO — Reducir bundle inicial
- Dynamic import de `xlsx` (428KB) solo cuando se necesite
- Dynamic import de `recharts` solo en Dashboard
- Dynamic import de `papaparse` solo en importación
- Potencial ahorro: ~600KB del bundle inicial

### 🥉 Opción 3: Database Query Optimization en Edge Function (Prioridad: Performance)
**Tiempo estimado:** 25 min
**Impacto:** MEDIO-ALTO — Reducir latencia del backend
- Consolidar 3 queries de rate limiting en 1 upsert
- Agregar índice compuesto en tabla rate_limits
- Implementar in-memory sliding window como cache L1
- Reducir DB calls de 3/request a 1/request

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| API keys agotadas | Media | Alto | Rotación automática entre 12 proveedores |
| Rate limit excedido | Baja | Medio | DB-backed + retry exponencial |
| Deploy fallido | Baja | Alto | Auto-rollback + backup previo |
| XSS/Injection | Baja | Alto | CSP estricto + sanitización de inputs |
| IndexedDB llena | Baja | Medio | TTL 30 días + limpieza automática |

---

## Notas del Equipo Multidisciplinario

### Software Architect
- Hooks separados correctamente: useContactProcessing → useAIPipeline → useDedup
- Pipeline desacoplado: reglas → IA → validación → dedup
- Edge Function modernizada a Deno.serve() nativo

### Backend Developer
- Edge Function type-safe: eliminado `as any` cast
- 12 proveedores IA con rotación automática y backoff exponencial
- Rate limiting DB-backed, cross-instance

### DevOps / SRE
- CI/CD robusto: lint → test → build → E2E → deploy → smoke → rollback
- Performance budget monitoreado en CI
- Dependabot activo para actualizaciones de seguridad

### QA Automation
- 199 tests unitarios cubriendo todas las lib críticas
- 21 tests E2E con Playwright (Chromium)
- Coverage thresholds: 70% lines, 70% functions

### Cybersecurity
- API keys cifradas con AES-GCM en localStorage
- CSP headers + CORS whitelist
- JWT verification en Edge Function
- Input sanitización (500 chars max por field)

### Product Manager
- BETA en producción, funcional
- Free tier: 500 contactos/lote, 3 lotes/día
- Pro tier: 10K contactos/lote, lotes ilimitados
- Pricing BYOK (Bring Your Own Key)

### UX/UI
- Onboarding wizard (3 pasos)
- Dark mode con next-themes
- Keyboard shortcuts
- Tabla virtualizada para datasets grandes

---

## Registro de Sesiones

### Sesión 1 — 2026-05-01 03:12 GMT+8

**Micro-misión:** Modernizar Edge Function + Fix Type Safety

**Cambios realizados:**
1. `supabase/functions/clean-contacts/index.ts`:
   - Eliminado import de `serve` de `deno.land/std@0.168.0` (deprecated)
   - Reemplazado `serve()` por `Deno.serve()` (built-in, más rápido)
   - Fix type safety: `as any` → `as unknown as (RawContact & { issues?: string[] })[]`
   - Eliminado eslint-disable comment innecesario

2. `src/lib/error-reporter.ts`:
   - Actualizado `APP_VERSION` de `v11.0-beta` a `v12.0-beta`

**Impacto:**
- **Performance**: Eliminación de import HTTP innecesario en cada cold start
- **Type Safety**: Eliminado último `as any` en código de producción
- **Mantenibilidad**: Version string sincronizada con proyecto

**Validación:**
- ✅ 199/199 tests pasando
- ✅ Build compila correctamente
- ✅ 0 lint errors
- ✅ Performance budget OK (< 2MB)

**Archivos modificados:**
- `supabase/functions/clean-contacts/index.ts`
- `src/lib/error-reporter.ts`

**Próxima micro-misión recomendada:** Unified Error Handling + Sentry Ready

---

*Documento vivo — Actualizar al inicio de cada sesión.*
