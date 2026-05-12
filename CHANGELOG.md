# Changelog

All notable changes to MejoraContactos will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/)

## [12.9.4] - 2026-05-13 — CTO Session 4: GitHub Pages Deploy

### Added
- **GitHub Pages deploy:** App alojada en https://pabloeckert.github.io/MejoraContactos/
- **SPA fallback:** 404.html para client-side routing en GitHub Pages

### Changed
- **Deploy:** Migrado de Hostinger a GitHub Pages (temporal)

---

## [12.9.3] - 2026-05-13 — CTO Session 3: Testing & Documentation

### Added
- **31 tests para clean-contacts Edge Function:** Provider config, prompts, CORS, rate limit cache, pipeline validation, input sanitization, fallback logic
- **CONTRIBUTING.md:** Staging workflow, branching strategy, PR template, convenciones actualizadas

### Changed
- **CONTRIBUTING.md:** Test count actualizado (199 → 301), staging workflow documentado

---

## [12.9.2] - 2026-05-13 — CTO Session 2: Performance & Testing

### Changed
- **Supabase client lazy init:** `supabase` export → `getSupabase()` async function. El cliente se inicializa solo cuando se llama, no en el carga inicial
- **Toaster unificado:** Eliminado radix Toaster (código muerto). Solo se usa Sonner

### Added
- **17 tests para Google Contacts Edge Function:** Action routing, auth URL, response format, contact parsing, delete batch logic
- **Staging environment:** GitHub Actions workflow para deploy a staging (`staging` branch → `/mejoracontactos-staging/`)
- **CHANGELOG.md** actualizado

---

## [12.9.1] - 2026-05-13 — CTO Audit & Fixes

### Fixed
- **error-reporter.ts:** APP_VERSION sincronizado de "v12.4-beta" a "v12.9"
- **phone-validator tests:** Fix flaky tests causados por race condition con lazy loading de libphonenumber-js — added `beforeAll` para asegurar que la librería esté cargada
- **export-utils.ts:** Eliminada duplicación de lógica CSV escape entre `exportCSV` y `buildCSV`

### Added
- **CTO_AUDIT.md:** Auditoría completa del proyecto (arquitectura, código, seguridad, performance, tests, CI/CD, documentación)
- **CHANGELOG.md:** Este archivo — registro de cambios por versión
- **HSTS header:** `Strict-Transport-Security` agregado a .htaccess
- **SECURITY.md:** Email de seguridad configurado (security@mejoraok.com)

### Improved
- **column-mapper.ts:** Regex de WhatsApp ahora detecta "mobile phone", "cell phone", "móvil", "movil"
- **MASTERPLAN.md:** Actualizado con datos reales (253 tests, fecha actualización)

---

## [12.9] - 2026-05-07 — Sesión 10

### Changed
- Limpieza multidisciplinaria: dead code, deps, docs

---

## [12.8] - 2026-05-05 — Sesión 9

### Added
- Google Contacts: delete contacts (batch delete con confirmación)
- CRM exports: Google Contacts, HubSpot, Salesforce, Zoho, Airtable
- Google Contacts: user info (email, nombre, avatar) al conectar
- 219 unit tests, 21 E2E tests

---

## [12.7] - 2026-05-02 — Sesiones 2-8

### Added
- Unified error handling (error-handler.ts: 8 categorías, 4 severidades)
- ErrorBoundaries granulares por sección
- Sentry integration (lazy-loaded, beforeSend redacta API keys)
- Dead dependency cleanup (12 deps eliminadas)
- Lazy loading de PapaParse, libphonenumber-js
- Rate limiting optimizado (1 RPC atómica + L1 cache)

### Changed
- Bundle: 433KB → 296KB (-31.6%)
- Edge Function: serve() → Deno.serve()

---

## [12.0] - 2026-05-01 — Sesión 1

### Added
- Initial release con pipeline híbrido (reglas + IA)
- 12 proveedores IA con rotación automática
- Importación: CSV, Excel, VCF, JSON, Google Contacts
- Exportación: CSV, Excel, VCF, JSON, JSONL, HTML
- IndexedDB para persistencia local
- Dashboard con métricas en tiempo real
- Onboarding wizard
- Dark mode, keyboard shortcuts, PWA
- GDPR: privacy policy, terms, cookie consent
