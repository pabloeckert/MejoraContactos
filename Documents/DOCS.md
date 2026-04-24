# 📚 MejoraContactos — Documentación Consolidada

> **⚡ Instrucción de actualización:** Cuando el usuario diga **"documentar"**, actualizar este archivo con el estado actual del proyecto, trabajos realizados, pendientes y cualquier cambio relevante. Todos los documentos viven en esta carpeta `Documents/`.

**Última actualización:** 2026-04-24 21:58 GMT+8  
**Versión:** v9.0 (Calidad y Testing)  
**Commit HEAD:** `4ef99cc`  
**Análisis profundo:** Ver `Documents/ANALISIS_PROFUNDO.md` (35 perspectivas, plan 5 etapas)  
**Repo:** [pabloeckert/MejoraContactos](https://github.com/pabloeckert/MejoraContactos)  
**Live:** https://util.mejoraok.com/mejoracontactos/  
**Deploy status:** ✅ Deploy verificado — HTTP 200 — 150 tests pasan

---

## 1. Descripción

MejoraContactos es una aplicación web para consolidar, limpiar y deduplicar bases de contactos desde múltiples fuentes heterogéneas (CSV, Excel, VCF, JSON, Google Contacts). Usa un pipeline híbrido: reglas determinísticas (80%+ casos) + IA con 12 proveedores y rotación automática de keys.

## 2. Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| UI | Tailwind CSS + shadcn/ui (Radix) |
| Persistencia local | IndexedDB via `idb` |
| Backend (IA) | Supabase Edge Functions (Deno) |
| Telefónica | `libphonenumber-js` (E.164) |
| Parsing | PapaParse (CSV), SheetJS/xlsx (Excel), parser propio (VCF) |
| Virtualización | `@tanstack/react-virtual` |
| Temas | `next-themes` (dark/light) |
| Gráficos | Recharts |
| Deploy frontend | GitHub Actions → SSH+SCP → Hostinger |
| Deploy Edge Functions | Supabase CLI (`npx supabase functions deploy`) |
| Supabase project | `tzatuvxatsduuslxqdtm` (propio del usuario) |

## 3. Arquitectura

```
src/
├── components/
│   ├── ApiKeysPanel.tsx         # Gestión de keys (UI, 12 proveedores)
│   ├── ColumnMapper.tsx         # Mapeo manual de columnas
│   ├── ContactsTable.tsx        # Tabla virtualizada con scores de validación
│   ├── DashboardPanel.tsx       # Métricas y gráficos de calidad
│   ├── ExportPanel.tsx          # Exportación multi-formato (6 formatos)
│   ├── FileDropzone.tsx         # Drag & drop de archivos
│   ├── GoogleContactsPanel.tsx  # OAuth multi-cuenta Google (hasta 5)
│   ├── HealthCheckPanel.tsx     # Test masivo de API keys + latencia
│   ├── HistoryPanel.tsx         # Historial de ops + deshacer (undo)
│   ├── ProcessingPanel.tsx      # Pipeline de procesamiento (UI shell)
│   ├── PipelineVisualizer.tsx   # Tracker visual de etapas del pipeline
│   └── ui/                      # shadcn/ui components (20+)
├── hooks/
│   ├── useContactProcessing.ts  # Lógica completa del pipeline (397 líneas)
│   └── use-toast.ts             # Toast hook
├── lib/
│   ├── ai-validator.ts          # Validación IA para casos ambiguos (cache)
│   ├── api-keys.ts              # Gestión de API keys (localStorage, multi-key)
│   ├── column-mapper.ts         # Auto-detección de columnas (ES + EN)
│   ├── db.ts                    # IndexedDB (CRUD + cursor batched + streaming)
│   ├── dedup.ts                 # Deduplicación O(n) hash index + Jaro-Winkler
│   ├── export-utils.ts          # Export CSV/Excel/VCF/JSON/JSONL/HTML
│   ├── field-validator.ts       # Validación semántica determinística
│   ├── parsers.ts               # Parseo CSV/Excel(lazy)/VCF/JSON
│   ├── phone-validator.ts       # Validación telefónica E.164 + WhatsApp
│   ├── providers.ts             # Config de 12 proveedores IA
│   ├── rule-cleaner.ts          # Limpieza por reglas (80%+ casos)
│   └── utils.ts                 # Utilidades (cn)
├── workers/
│   ├── pipeline.worker.ts       # Web Worker: batchRuleClean + dedup
│   └── useWorkerPipeline.ts     # Helper dispatch al worker (auto-threshold 10K)
├── types/
│   └── contact.ts               # Interfaces principales (UnifiedContact, etc.)
├── pages/
│   ├── Index.tsx                # Página principal (6 tabs)
│   └── NotFound.tsx             # 404
└── integrations/
    └── supabase/
        ├── client.ts            # Cliente Supabase (URL + anon key JWT)
        └── types.ts             # Tipos de DB

supabase/
├── config.toml                  # project_id: tzatuvxatsduuslxqdtm
└── functions/
    ├── clean-contacts/index.ts  # Edge Function: limpieza IA (12 proveedores)
    └── google-contacts-auth/    # Edge Function: OAuth Google Contacts
```

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

**Etapas detalladas:**
1. **Parseo:** CSV/Excel/VCF/JSON → `ParsedFile` con filas y columnas
2. **Mapeo:** Auto-detección de columnas (nombre, email, teléfono, empresa, cargo)
3. **Reglas:** Limpieza determinística — junk removal, title case, email regex, phone E.164, auto-split nombres
4. **IA Limpieza:** Solo contactos que las reglas no resolvieron (batch 20-25)
5. **IA Verificación:** Revisión cruzada de la limpieza por segunda IA
6. **IA Corrección:** Fix de issues detectados por la verificación
7. **Validación:** Scoring semántico por campo (0-100) + IA para ambiguos
8. **Dedup:** Email exacto O(1) → teléfono O(1) → nombre Jaro-Winkler acotado O(k)

**Configuración de pipeline:**
- Modo **Pipeline 3 IAs**: usa 3 proveedores distintos (limpiar → verificar → corregir)
- Modo **Proveedor único**: un solo proveedor para todo
- Selector de país: 21 países con código telefónico

## 5. Proveedores de IA

| # | ID | Proveedor | Modelo | Estado |
|---|-----|----------|--------|--------|
| 1 | groq | Groq Cloud | llama-3.3-70b-versatile | ✅ Funcionando |
| 2 | openrouter | OpenRouter | meta-llama/llama-3.3-70b-instruct:free | ✅ Funcionando (rate limit temporal) |
| 3 | together | Together AI | meta-llama/Llama-3.3-70B-Instruct-Turbo-Free | ⏳ Sin testear |
| 4 | cerebras | Cerebras | llama-3.3-70b | ⏳ Sin testear |
| 5 | deepinfra | DeepInfra | meta-llama/Llama-3.3-70B-Instruct | ⏳ Sin testear |
| 6 | sambanova | SambaNova | Meta-Llama-3.3-70B-Instruct | ⏳ Sin testear |
| 7 | mistral | Mistral AI | mistral-small-latest | ⏳ Sin testear |
| 8 | deepseek | DeepSeek | deepseek-chat | ⏳ Sin testear |
| 9 | gemini | Google AI Studio | gemini-2.0-flash-exp | ⏳ Sin testear |
| 10 | cloudflare | Cloudflare Workers AI | @cf/meta/llama-3.3-70b-instruct-fp8-fast | ⏳ Sin testear |
| 11 | huggingface | Hugging Face | meta-llama/Llama-3.3-70B-Instruct | ⏳ Sin testear |
| 12 | nebius | Nebius AI | meta-llama/Llama-3.3-70B-Instruct | ⏳ Sin testear |

**Notas sobre proveedores:**
- **"lovable" eliminado completamente** del código — era una API interna de Lovable.dev, no funciona en hosting externo
- **OpenRouter**: modelo `llama-3.3-70b-instruct:free`
- Rotación automática: 429/402/401 → siguiente proveedor
- Soporta múltiples keys por proveedor
- Default pipeline: groq (limpiar) → openrouter (verificar) → gemini (corregir)

## 6. Formatos Soportados

### Importación
| Formato | Parser | Notas |
|---------|--------|-------|
| CSV (.csv) | PapaParse | UTF-8, auto-detected headers |
| Excel (.xlsx/.xls) | SheetJS (lazy) | Primera hoja, lazy-loaded |
| VCF (.vcf) | Parser propio | vCard 3.0, multi-teléfono |
| JSON (.json) | nativo | Array u objeto con array |
| Google Contacts | OAuth + API People | Multi-cuenta (hasta 5) |

### Exportación
| Formato | Uso |
|---------|-----|
| CSV | Google Contacts, Excel |
| Excel | 2 hojas (limpios + descartados) |
| VCF | vCard 3.0 para importar en dispositivos |
| JSON | Datos completos con metadata |
| JSONL | Fine-tuning IA (OpenAI/HuggingFace) |
| HTML | Informe imprimible con estadísticas (XSS-safe) |

## 7. Deploy

### Frontend (automático)

**Pipeline CI/CD:**
1. Push a `main` → GitHub Actions trigger
2. `npm ci` → `npm test` (150+ tests) → `npm run build`
3. SSH: limpia `assets/` en Hostinger
4. SCP: sube `dist/` al server

**Configuración:**
- `vite.config.ts`: `base: "/mejoracontactos/"` en producción
- `public/.htaccess`: Rewrite rules para SPA + redirect de mejoraok.com → util.mejoraok.com
- GitHub Secrets: `SSH_HOST`, `SSH_USER`, `SSH_PASS`, `SSH_PORT`

### Edge Functions (manual)

```bash
# Login con token de Supabase
npx supabase login --token sbp_XXXXX

# Link al proyecto
cd MejoraContactos
npx supabase link --project-ref tzatuvxatsduuslxqdtm

# Deploy Edge Functions
npx supabase functions deploy clean-contacts
npx supabase functions deploy google-contacts-auth
```

**⚠️ IMPORTANTE:** Las Edge Functions NO se deployan automáticamente. Hay que hacerlo manualmente con Supabase CLI cada vez que se modifican.

### URLs de Producción

| URL | Descripción |
|-----|------------|
| https://util.mejoraok.com/ | Landing page de utilidades |
| https://util.mejoraok.com/mejoracontactos/ | **App principal** |
| https://mejoraok.com/util/mejoracontactos/ | Fallback (redirect a subdominio) |

### Infraestructura

| Servicio | Detalle |
|----------|---------|
| Hosting frontend | Hostinger (FTP IP: 185.212.70.250, SSH puerto: 65002) |
| Usuario SSH | `u846064658` |
| Ruta base | `/home/u846064658/domains/mejoraok.com/public_html/util/` |
| Supabase project | `tzatuvxatsduuslxqdtm` (propio del usuario) |
| Supabase URL | `https://tzatuvxatsduuslxqdtm.supabase.co` |
| Subdominio DNS | `util.mejoraok.com` → Hostinger |

## 8. Registro de Cambios

### v9.0 — 2026-04-24 (Calidad y Testing)

| Cambio | Tipo | Detalle |
|--------|------|---------|
| E2E Playwright | ✅ Testing | 14 tests E2E: onboarding, navegación, theme, modos, empty states, settings, footer, privacy/terms, manifest, console errors |
| Coverage config | ✅ Testing | vitest coverage v8 con thresholds: 70% lines, 70% functions, 60% branches |
| Performance budget | ✅ Testing | 5 tests: dist <2MB, index <450KB, no JS >500KB, CSS <50KB |
| A11y tests | ✅ Testing | 5 tests: aria-labels, alt text, form labels, heading hierarchy, focus styles |
| Edge Function tests | ✅ Testing | 18 tests: input validation, sanitización, provider validation |
| Playwright config | 🔧 Config | chromium, webServer auto-start, CI-aware retries |
| package.json scripts | 🔧 CI | test:coverage, test:e2e, test:e2e:headed |

### v8.0 — 2026-04-24 (Performance y Escalabilidad)

| Cambio | Tipo | Detalle |
|--------|------|---------|
| PWA manifest | ✨ Feature | manifest.json + Service Worker (cache-first para assets, network-first para APIs) |
| SW registration | ✨ Feature | Registro automático del Service Worker en main.tsx |
| usePipelineConfig | 🔧 Refactor | Hook extraído para configuración de pipeline (providers, mappings, country) |
| ai-cleaner.ts | 🔧 Refactor | Lógica de limpieza IA extraída a utilidad independiente |
| Rollback automático | 🔧 DevOps | Backup antes de deploy + rollback si falla |
| Build smoke test | 🔧 CI | Verifica dist/ antes de deploy + HTTP check post-deploy |
| Cloudflare guide | 📚 Docs | Documentación paso a paso para configurar CDN |

### v7.0 — 2026-04-24 (UX y Onboarding)

| Cambio | Tipo | Detalle |
|--------|------|---------|
| OnboardingWizard | ✨ Feature | Wizard de 3 pasos en primera visita (importar → limpiar → exportar) |
| SimpleMode | ✨ Feature | Modo simple vs avanzado — toggle en header, persistencia en localStorage |
| EmptyState | 🎨 UI | Componente reutilizable con ilustraciones contextuales para tabs vacíos |
| PreviewPanel | ✨ Feature | Vista previa antes de procesar: columnas detectadas, duplicados potenciales, campos vacíos |
| SkeletonLoader | 🎨 UI | Table, Card, Dashboard skeletons para loading states |
| Analytics | 📊 Infra | Utility de tracking en localStorage (eventos de wizard, import, processing, export) |
| Copy mejorada | ✍️ UX | Empty states con CTAs contextuales, tooltips descriptivos |
| Index refactor | 🔧 Refactor | Integración de todos los componentes, modo simple/avanzado |

### v6.0 — 2026-04-24 (Seguridad y Estabilidad)

**Commit:** `3018f84`

| Cambio | Tipo | Detalle |
|--------|------|---------|
| CSP headers | 🔒 Security | Content-Security-Policy + X-Content-Type-Options + X-Frame-Options + X-XSS-Protection + Referrer-Policy + Permissions-Policy |
| JWT verification | 🔒 Security | Edge Function verifica token contra Supabase Auth |
| Input validation | 🔒 Security | Validación de body + sanitización (max 10K contacts, field length limits) |
| npm audit | 🔧 CI | Warning en pipeline, no bloquea deploy |
| ErrorBoundary | 🛡️ Stability | React Error Boundary global con error reporter utility |
| Privacy Policy | 📄 Legal | Página /privacy — GDPR-compliant |
| Terms of Service | 📄 Legal | Página /terms |
| Footer | 🎨 UI | Links a Privacy + Terms |
| Tests | ✅ | 150 tests pasan, build OK |

### v5.0 — 2026-04-24 (Health Check + Historial/Deshacer)

**Commit:** `9e225c2`

| Cambio | Tipo | Detalle |
|--------|------|---------|
| HealthCheckPanel | ✨ Feature | Test masivo de todas las API keys con latencia y status visual |
| HistoryPanel | ✨ Feature | Snapshots automáticos antes de limpieza, deshacer con un click |
| IndexedDB v3 | 🔧 Upgrade | Store "history" con max 10 snapshots, cursor-based |
| Auto-snapshot | ✨ Feature | Guarda estado antes de procesar y antes de reiniciar |
| Grid responsive | 🎨 UI | Health Check + Historial lado a lado en tab Config |
| Bundle | 📊 Perf | +13KB (376KB → 389KB index) |

### v4.5 — 2026-04-24 (Limpieza proveedor lovable + plan optimizado)

**Commit:** `a724830`

| Cambio | Tipo | Detalle |
|--------|------|---------|
| "lovable" eliminado del Edge Function | 🔴 Fix | Type, default, env map, fallback — todo limpio |
| "lovable" eliminado del frontend | 🔴 Fix | Priority lists, stageConfig default, icon maps |
| Tests actualizados | 🟠 Mantenimiento | 150/150 tests pasan, 0 referencias a lovable |
| Default correct provider → gemini | 🟠 Mejora | Antes era "lovable" (inexistente) |
| Plan de trabajo reorganizado | 📚 Docs | Etapas claras y optimizadas |
| Deploy verificado | ✅ Live | HTTP 200 en producción |

### v4.4 — 2026-04-24 (Fix anon key + modelo OpenRouter)

**Commits:** `8742638`

| Cambio | Tipo | Detalle |
|--------|------|---------|
| Anon key JWT corregida | 🔴 Fix crítico | Key obtenida via Management API |
| OpenRouter modelo actualizado | 🔴 Fix | `mistral-small-3.2` → `llama-3.3-70b-instruct:free` |
| Edge Function redeployada | 🔴 Deploy | Con todos los fixes |
| Groq testeado | ✅ Verificación | HTTP 200, limpieza funciona |
| OpenRouter testeado | ✅ Verificación | Modelo OK, rate limit temporal |

### v4.3 — 2026-04-24 (Migración Supabase)

**Commits:** `3dfcce3`, `14b4319`, `d75e9b3`

Migración a Supabase propio `tzatuvxatsduuslxqdtm`, Edge Functions deployadas, CORS fix.

### v4.2 — 2026-04-24 (CORS Fix + Consolidación Docs)

CORS: `util.mejoraok.com` agregado. Documentación consolidada en `Documents/DOCS.md`.

### v4.1 — 2026-04-23 (Subdominio + Landing page)

Subdominio `util.mejoraok.com` activo, landing page de utilidades.

### v4.0 — 2026-04-23 (Hardening & Performance)

Tests de componentes, Web Worker, IndexedDB batched, xlsx lazy-loaded, a11y, rate limiting. Bundle: index 376KB (−53%), 150+ tests.

### v3.0–v3.3 — 2026-04-22/23 (Core + Refactor)

Core completo: pipeline IA, dedup O(n), Google Contacts, exportación 6 formatos, dark mode, multi-país (21), refactor ProcessingPanel, CORS, tests unitarios (113).

## 9. Plan de Trabajo — Etapas Optimizadas

### Estado general: ✅ Core completo | ✅ Deploy funcional | ✅ APIs verificadas | ✅ Código limpio | ✅ Health Check | ✅ Historial/Undo

### ✅ Etapas Completadas

| Etapa | Descripción | Completado |
|-------|------------|------------|
| Core (v3.0) | App completa con pipeline IA | 2026-04-22 |
| Security & Quality (v3.1) | XSS, .env, VCF fixes | 2026-04-23 |
| Tests + Multi-país (v3.2) | 113 tests, 21 países | 2026-04-23 |
| Refactor (v3.3) | ProcessingPanel dividido | 2026-04-23 |
| Hardening (v4.0) | Worker, lazy xlsx, a11y, rate limit | 2026-04-23 |
| Subdominio (v4.1) | util.mejoraok.com + landing | 2026-04-23 |
| CORS Fix (v4.2) | util.mejoraok.com en whitelist | 2026-04-24 |
| Migración Supabase (v4.3) | Proyecto propio + deploy | 2026-04-24 |
| Fix APIs (v4.4) | Anon key + modelo OpenRouter | 2026-04-24 |
| Limpieza código (v4.5) | Eliminar proveedor "lovable" obsoleto | 2026-04-24 |
| **Health Check + Undo (v5.0)** | **Test masivo de keys + historial con deshacer** | **2026-04-24** |

### 📋 Próximas Etapas Sugeridas

#### Etapa 6 — Verificación completa de proveedores
| # | Tarea | Detalle | Estado |
|---|-------|---------|--------|
| 6.1 | Test Groq | Cargar key, test desde app live | ✅ Funcionando |
| 6.2 | Test OpenRouter | Modelo actualizado, rate limit temporal | ✅ Funcionando |
| 6.3 | Test pipeline completo | Importar CSV → procesar → verificar | ⏳ Pendiente usuario |
| 6.4 | Test otros proveedores | Cargar keys de Together, Cerebras, etc. | ⏳ Opcional |
| 6.5 | Test Google OAuth | Importación desde Google Contacts | ⏳ Pendiente |

#### Etapa 7 — Mejoras funcionales
| # | Tarea | Detalle | Estado |
|---|-------|---------|--------|
| 7.1 | Health check automático | Test masivo de keys con latencia y status visual | ✅ v5.0 |
| 7.2 | Monitoreo Edge Functions | Revisar logs en Supabase Dashboard | ⏳ Pendiente |
| 7.3 | Undo/History | Snapshots antes de limpieza, deshacer con un click | ✅ v5.0 |

#### Etapa 8 — Optimización avanzada
| # | Tarea | Detalle |
|---|-------|---------|
| 8.1 | PWA offline | Service worker + manifest |
| 8.2 | Batch progress real | Streaming de progreso desde Edge Function |
| 8.3 | Exportación programada | Auto-export post-limpieza |

## 10. Estado por Componente

| Componente | Estado | Notas |
|-----------|--------|-------|
| Parseo multi-formato | ✅ | CSV, Excel (lazy), VCF, JSON |
| Mapeo automático | ✅ | Español + inglés |
| Limpieza por reglas | ✅ | 80%+ casos, Web Worker para 10K+ |
| Limpieza por IA | ✅ | 12 proveedores, rotación automática |
| Pipeline 3 etapas | ✅ | Limpiar → Verificar → Corregir |
| Validación semántica | ✅ | Scoring 0-100 por campo |
| Validación telefónica | ✅ | E.164, WhatsApp, 21 países |
| Deduplicación | ✅ | O(n) hash index, Web Worker |
| Google Contacts | ✅ | Multi-cuenta OAuth |
| Exportación | ✅ | 6 formatos |
| Dashboard | ✅ | Métricas + gráficos |
| Dark mode | ✅ | next-themes |
| Deploy CI/CD | ✅ | GitHub Actions → Hostinger |
| Deploy Edge Functions | ✅ | Supabase CLI → proyecto propio |
| CORS | ✅ | `util.mejoraok.com` habilitado |
| Supabase | ✅ | Proyecto propio `tzatuvxatsduuslxqdtm` |
| Anon key JWT | ✅ | Obtenida via Management API |
| Groq API | ✅ | Verificado HTTP 200 |
| OpenRouter API | ✅ | Modelo actualizado, verificado |
| Tests | ✅ | 188 tests (174 unit + 14 E2E), 15 archivos |
| CSP headers | ✅ | Content-Security-Policy + 5 headers de seguridad |
| JWT auth | ✅ | Edge Function verifica contra Supabase Auth |
| Input validation | ✅ | Zod-like validación + sanitización en Edge Function |
| ErrorBoundary | ✅ | React Error Boundary global |
| Privacy Policy | ✅ | /privacy — GDPR-compliant |
| Terms of Service | ✅ | /terms |
| Error reporter | ✅ | Utility para tracking de errores (preparado para Sentry) |
| OnboardingWizard | ✅ | Wizard de 3 pasos, muestra en primera visita |
| SimpleMode | ✅ | Modo simple/avanzado con toggle en header |
| EmptyState | ✅ | Componente reutilizable con ilustraciones contextuales |
| PreviewPanel | ✅ | Vista previa pre-proceso con detección de columnas |
| SkeletonLoader | ✅ | Table, Card, Dashboard skeletons |
| Analytics | ✅ | Tracking de eventos en localStorage (preparado para Umami) |
| Multi-país | ✅ | 21 países con selector |
| Web Worker | ✅ | batchRuleClean + dedup offloaded |
| IndexedDB batched | ✅ | Cursor-based, streamContacts() |
| Bundle splitting | ✅ | xlsx lazy, index 376KB |
| Accesibilidad | ✅ | aria-labels, focus-visible, roles |
| Rate limiting | ✅ | 30 req/min por IP |
| Código limpio | ✅ | 0 refs a proveedores obsoletos |

## 11. Notas de Seguridad

1. **`.env` no se commitea** — en `.gitignore`, removido del tracking
2. **API keys en localStorage** — el usuario las ingresa manualmente, nunca van al repo
3. **CORS restringido** — whitelist: `util.mejoraok.com`, `mejoraok.com`, `localhost:8080`, `localhost:5173`
4. **XSS en reportes** — `escapeHtml()` aplicado en `generateHTMLReport()`
5. **Supabase anon key** — pública, protegida por RLS
6. **Rate limiting** — 30 req/min por IP en Edge Function, sliding window
7. **Tokens de deploy** — NO se commitean (solo en entorno local del deployador)
8. **Proveedores obsoletos eliminados** — "lovable" removido completamente del código

## 12. Análisis Profundo Multidisciplinario

Se realizó un análisis completo del proyecto desde 35 perspectivas profesionales. El documento completo vive en:

📄 **`Documents/ANALISIS_PROFUNDO.md`**

### Resumen de Hallazgos Críticos

| Área | Hallazgo Principal | Prioridad |
|------|-------------------|-----------|
| **Seguridad** | Sin CSP headers, Edge Function sin auth JWT, API keys en localStorage sin encriptar | 🔴 Alta |
| **UX** | Sin onboarding wizard, 6 tabs abruman al usuario nuevo, sin preview pre-proceso | 🟡 Media-Alta |
| **DevOps** | Sin rollback automático, Edge Functions deploy manual, sin staging | 🟡 Media |
| **Testing** | 150 unit tests bien, pero 0 E2E, 0 integration, 0 visual regression | 🟡 Media |
| **Legal** | Sin Privacy Policy ni ToS — riesgo GDPR | 🔴 Alta |
| **Crecimiento** | Sin analytics, sin landing page SEO, sin presencia en redes | 🟢 Media-Baja |
| **ML/AI** | Sin embeddings para dedup semántica, prompts hardcodeados | 🟢 Futuro |

### Plan por Etapas (5 semanas)

1. **Semana 1:** Seguridad y Estabilidad (CSP, auth, Sentry, Error Boundaries)
2. **Semana 2:** UX y Onboarding (wizard, modo simple, preview, analytics)
3. **Semana 3:** Performance (PWA, hooks refactor, CDN, rollback deploy)
4. **Semana 4:** Testing (E2E Playwright, coverage, integration tests)
5. **Semana 5+:** Crecimiento (landing page, Product Hunt, i18n, monetización)

---

## 13. Comandos Rápidos

```bash
# Desarrollo local
npm install && npm run dev    # → http://localhost:8080

# Tests
npm test                      # 150 tests

# Deploy Edge Functions (manual)
npx supabase login --token sbp_XXXXX
npx supabase link --project-ref tzatuvxatsduuslxqdtm
npx supabase functions deploy clean-contacts
npx supabase functions deploy google-contacts-auth

# Deploy frontend (automático al pushear a main)
git push origin main

# Verificar que no hay referencias a proveedores obsoletos
grep -rn "lovable" src/ supabase/ --include="*.ts" --include="*.tsx"
```

---

*Documento consolidado — reemplaza toda documentación previa. Actualizar al decir "documentar".*
