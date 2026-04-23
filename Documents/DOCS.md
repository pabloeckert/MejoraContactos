# 📚 MejoraContactos — Documentación Consolidada

> **⚡ Instrucción de actualización:** Cuando el usuario diga **"documentar"**, actualizar este archivo con el estado actual del proyecto, trabajos realizados, pendientes y cualquier cambio relevante.

**Última actualización:** 2026-04-24 05:52 GMT+8  
**Versión:** v4.3 (migración Supabase + CORS fix + deploy completo)  
**Commit HEAD:** `d75e9b3`  
**Repo:** [pabloeckert/MejoraContactos](https://github.com/pabloeckert/MejoraContactos)  
**Live:** https://util.mejoraok.com/mejoracontactos/  
**Deploy status:** ✅ Frontend + Edge Functions desplegados

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
        ├── client.ts            # Cliente Supabase (URL + publishable key)
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

| # | ID | Proveedor | Modelo | Notas |
|---|-----|----------|--------|-------|
| 1 | groq | Groq Cloud | llama-3.3-70b-versatile | Free tier generoso, ultra rápido |
| 2 | openrouter | OpenRouter | mistralai/mistral-small-3.2-24b-instruct:free | Modelos free |
| 3 | together | Together AI | meta-llama/Llama-3.3-70B-Instruct-Turbo-Free | Gratis |
| 4 | cerebras | Cerebras | llama-3.3-70b | El más rápido |
| 5 | deepinfra | DeepInfra | meta-llama/Llama-3.3-70B-Instruct | Pay-per-token |
| 6 | sambanova | SambaNova | Meta-Llama-3.3-70B-Instruct | Free tier diario |
| 7 | mistral | Mistral AI | mistral-small-latest | Europeo |
| 8 | deepseek | DeepSeek | deepseek-chat | Muy económico |
| 9 | gemini | Google AI Studio | gemini-2.0-flash-exp | Free tier generoso |
| 10 | cloudflare | Cloudflare Workers AI | @cf/meta/llama-3.3-70b-instruct-fp8-fast | Requiere TOKEN:ACCOUNT_ID |
| 11 | huggingface | Hugging Face | meta-llama/Llama-3.3-70B-Instruct | Miles de modelos |
| 12 | nebius | Nebius AI | meta-llama/Llama-3.3-70B-Instruct | Free credits |
| 13 | lovable | Lovable AI (fallback) | google/gemini-3-flash-preview | Solo en Lovable.dev |

**Rotación automática:**
- Si un proveedor devuelve 429 (rate limit) / 402 (sin créditos) / 401 (key inválida), rota al siguiente
- Soporta múltiples keys por proveedor
- Orden de fallback configurable en el hook `suggestOptimalConfig()`

**⚠️ Nota:** El proveedor "lovable" usa la API interna de Lovable.dev y NO funciona en hosting externo (Hostinger). Está como fallback del fallback.

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

**⚠️ IMPORTANTE:** Si se modifican las Edge Functions, hay que redeployarlas manualmente con Supabase CLI. El frontend se deploya solo via GitHub Actions, pero las Edge Functions NO.

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

### v4.3 — 2026-04-24 (Migración Supabase + Deploy completo)

**Commits:** `3dfcce3`, `14b4319`, `d75e9b3`

| Cambio | Tipo | Detalle |
|--------|------|---------|
| Migración a Supabase propio | 🔴 Infra | Proyecto `tzatuvxatsduuslxqdtm` (antes `jurmgatcyxjkutmzweey`) |
| Supabase URL actualizada | 🔴 Config | `client.ts` → nueva URL + publishable key |
| Edge Functions deployadas | 🔴 Deploy | `clean-contacts` + `google-contacts-auth` en nuevo proyecto |
| CORS fix desplegado | 🔴 Fix | `util.mejoraok.com` en ALLOWED_ORIGINS (ambas funciones) |
| `supabase/.temp` en gitignore | 🟠 Limpieza | Archivos de estado local fuera del repo |
| Docs actualizados | 📚 Docs | Proyecto Supabase, deploy commands, infra actualizada |

**Problema resuelto:** La app usaba un proyecto de Supabase (`jurmgatcyxjkutmzweey`) que no pertenecía al usuario. Las Edge Functions no se podían modificar ni deployar, y el CORS bloqueaba todas las llamadas desde `util.mejoraok.com`. Migración completa a proyecto propio con CORS fix y deploy exitoso.

### v4.2 — 2026-04-24 (CORS Fix + Consolidación Docs)

| Cambio | Tipo | Archivo |
|--------|------|---------|
| CORS: `util.mejoraok.com` agregado a ALLOWED_ORIGINS | 🔴 Fix crítico | `clean-contacts/index.ts` |
| CORS: `util.mejoraok.com` agregado a ALLOWED_ORIGINS | 🔴 Fix crítico | `google-contacts-auth/index.ts` |
| Carpeta `documents/` renombrada a `Documents/` | 📚 Docs | `Documents/DOCS.md` |
| Documentación consolidada en un solo archivo | 📚 Docs | `Documents/DOCS.md` |

### v4.1 — 2026-04-23 (Subdominio + Landing page)

| Cambio | Tipo | Archivo |
|--------|------|---------|
| Subdominio `util.mejoraok.com` activo | 🟠 Infra | DNS Hostinger |
| Landing page de utilidades en `util.mejoraok.com/` | 🟠 Infra | `/public_html/util/index.html` |
| URL principal actualizada a subdominio | 📚 Docs | docs |

### v4.0 — 2026-04-23 (Hardening & Performance)

**Commits:** `cf3d09f`, `dce5d41`, `55e56f6`

| Cambio | Tipo | Detalle |
|--------|------|---------|
| Tests de componentes (37 nuevos) | 🔴 Testing | useContactProcessing, PipelineVisualizer, ColumnMapper, ExportPanel |
| CI: `npm test` en deploy.yml | 🔴 CI/CD | Tests antes del build |
| Web Worker para pipeline | 🟠 Performance | batchRuleClean + dedup en worker thread |
| IndexedDB cursor batched | 🟠 Performance | streamContacts(), batch ops |
| xlsx lazy-loaded | 🟠 Performance | 429KB solo al parsear/exportar |
| Accesibilidad | 🟡 a11y | aria-labels, focus-visible, sr-only |
| Rate limiting | 🔴 Seguridad | 30 req/min por IP en Edge Function |

**Bundle:** index 376KB (−53%), xlsx 429KB lazy, 150+ tests

### v3.3 — 2026-04-23 (Refactor + CORS)

| Cambio | Tipo |
|--------|------|
| ProcessingPanel dividido: 705 → 248 líneas | 🟠 Refactor |
| Hook `useContactProcessing` extraído | 🟠 Refactor |
| `PipelineVisualizer` componente propio | 🟠 Refactor |
| CORS whitelist en ambas Edge Functions | 🔴 Seguridad |

### v3.2 — 2026-04-23 (Tests + Multi-País)

| Cambio | Tipo |
|--------|------|
| 113 tests unitarios (7 archivos) | 🔴 Testing |
| `defaultCountry` en ruleClean/fieldValidator | 🟡 Multi-país |
| Selector de país: 21 países | 🟡 Multi-país |

### v3.1 — 2026-04-23 (Security & Quality)

| Cambio | Tipo |
|--------|------|
| `.env` removido de git | 🔴 Seguridad |
| XSS fix en HTML report | 🔴 Seguridad |
| ai-validator.ts reescrito | 🟡 Bug fix |
| VCF parser fixes | 🟡 Bug fix |
| PROVIDERS/api-keys extraídos | 🟠 Mejora |

### v3.0 — 2026-04-22 (Core completo)

Deploy funcional con CI/CD, validación telefónica, dedup O(n), Google Contacts, exportación JSONL/HTML, dark mode, pipeline 3 etapas.

## 9. Plan de Trabajo — Estado y Etapas

### Estado general: ✅ Core completo | ✅ Deploy funcional | ⏳ Verificación en vivo pendiente

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
| Migración Supabase (v4.3) | Proyecto propio + deploy completo | 2026-04-24 |

### 📋 Próximas Etapas

#### Etapa 7 — Verificación Post-Deploy
| # | Tarea | Detalle | Estado |
|---|-------|---------|--------|
| 7.1 | Test API Groq en vivo | Cargar key, hacer test desde app live | ⏳ Pendiente (requiere API key del usuario) |
| 7.2 | Test pipeline completo | Importar CSV, procesar, verificar resultados | ⏳ |
| 7.3 | Verificar Google OAuth | Test importación desde Google Contacts | ⏳ |
| 7.4 | Monitoreo | Revisar logs en Supabase Dashboard | ⏳ |

#### Etapa 8 — Mejoras de Proveedores
| # | Tarea | Detalle |
|---|-------|---------|
| 8.1 | Eliminar "lovable" del fallback | Solo funciona en Lovable.dev |
| 8.2 | Health check automático | Test periódico de keys desde la UI |
| 8.3 | Actualizar modelos | Verificar que los modelos siguen activos |

## 10. Resumen de Estado por Componente

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
| Exportación | ✅ | 6 formatos (CSV, Excel, VCF, JSON, JSONL, HTML) |
| Dashboard | ✅ | Métricas + gráficos |
| Dark mode | ✅ | next-themes |
| Deploy CI/CD | ✅ | GitHub Actions → Hostinger (frontend) |
| Deploy Edge Functions | ✅ | Supabase CLI → proyecto propio |
| CORS | ✅ | `util.mejoraok.com` en whitelist, deployado |
| Supabase | ✅ | Proyecto propio `tzatuvxatsduuslxqdtm` |
| Tests | ✅ | 150+ tests, 11 archivos |
| Multi-país | ✅ | 21 países con selector |
| Web Worker | ✅ | batchRuleClean + dedup offloaded |
| IndexedDB batched | ✅ | Cursor-based, streamContacts() |
| Bundle splitting | ✅ | xlsx lazy, index 376KB |
| Accesibilidad | ✅ | aria-labels, focus-visible, roles |
| Rate limiting | ✅ | 30 req/min por IP |
| API keys IA | ⏳ | Requiere que el usuario cargue al menos una |

## 11. Notas de Seguridad

1. **`.env` no se commitea** — en `.gitignore`, removido del tracking
2. **API keys en localStorage** — el usuario las ingresa manualmente, nunca van al repo
3. **CORS restringido** — whitelist: `util.mejoraok.com`, `mejoraok.com`, `localhost:8080`, `localhost:5173`
4. **XSS en reportes** — `escapeHtml()` aplicado en `generateHTMLReport()`
5. **Supabase publishable key** — pública, protegida por RLS
6. **Rate limiting** — 30 req/min por IP en Edge Function, sliding window
7. **Tokens de deploy** — NO se commitean (solo en entorno local del deployador)

## 12. Comandos Rápidos

```bash
# Desarrollo local
npm install && npm run dev    # → http://localhost:8080

# Tests
npm test                      # 150+ tests

# Deploy Edge Functions (manual)
npx supabase login --token sbp_XXXXX
npx supabase link --project-ref tzatuvxatsduuslxqdtm
npx supabase functions deploy clean-contacts
npx supabase functions deploy google-contacts-auth

# Deploy frontend (automático al pushear a main)
git push origin main
```

---

*Documento consolidado — reemplaza toda documentación previa. Actualizar al decir "documentar".*
