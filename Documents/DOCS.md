# 📚 MejoraContactos — Documentación Consolidada

> **⚡ Instrucción de actualización:** Cuando el usuario diga **"documentar"**, actualizar este archivo con el estado actual del proyecto, trabajos realizados, pendientes y cualquier cambio relevante.

**Última actualización:** 2026-04-24 05:30 GMT+8  
**Versión:** v4.2 (fix CORS + deploy)  
**Commit HEAD:** `3f9f665` + fixes CORS  
**Repo:** [pabloeckert/MejoraContactos](https://github.com/pabloeckert/MejoraContactos)  
**Live:** https://util.mejoraok.com/mejoracontactos/  
**Deploy status:** 🔄 Pendiente deploy Edge Functions CORS fix

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
| Deploy Edge Functions | Supabase CLI (`supabase functions deploy`) |
| DB Supabase | `jurmgatcyxjkutmzweey` (solo para Edge Functions, no tablas) |

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
        ├── client.ts            # Cliente Supabase (URL + anon key)
        └── types.ts             # Tipos de DB

supabase/
├── config.toml                  # project_id: jurmgatcyxjkutmzweey
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
# Instalar Supabase CLI si no está
npm i -g supabase

# Login
supabase login

# Link al proyecto
cd MejoraContactos
supabase link --project-ref jurmgatcyxjkutmzweey

# Deploy Edge Functions
supabase functions deploy clean-contacts
supabase functions deploy google-contacts-auth
```

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
| Supabase project | `jurmgatcyxjkutmzweey` |
| Subdominio DNS | `util.mejoraok.com` → Hostinger |

## 8. Registro de Cambios

### v4.2 — 2026-04-24 (CORS Fix + Consolidación Docs)

| Cambio | Tipo | Archivo |
|--------|------|---------|
| CORS: `util.mejoraok.com` agregado a ALLOWED_ORIGINS | 🔴 Fix crítico | `clean-contacts/index.ts` |
| CORS: `util.mejoraok.com` agregado a ALLOWED_ORIGINS | 🔴 Fix crítico | `google-contacts-auth/index.ts` |
| Carpeta `documents/` renombrada a `Documents/` | 📚 Docs | `Documents/DOCS.md` |
| Documentación consolidada en un solo archivo | 📚 Docs | `Documents/DOCS.md` |

**⚠️ IMPORTANTE:** Los cambios de CORS en Edge Functions requieren redeploy:
```bash
supabase functions deploy clean-contacts
supabase functions deploy google-contacts-auth
```

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

### Estado general: ✅ Core completo | 🔄 Deploy pendiente (CORS fix)

### ✅ Etapas Completadas (v3.0 → v4.0)

| Etapa | Descripción | Estado |
|-------|------------|--------|
| Testing (113 tests) | Unit tests para lib/ | ✅ |
| Multi-país | 21 países, selector UI | ✅ |
| Refactor ProcessingPanel | Hook + Visualizer extraídos | ✅ |
| CORS Edge Functions | Whitelist origins | ✅ |
| Hardening & Performance | Worker, lazy xlsx, a11y, rate limit | ✅ |

### 🔄 Etapa Actual — Fix CORS + Deploy (v4.2)

**Problema:** La app está en `util.mejoraok.com` pero las Edge Functions solo permitían `mejoraok.com`. **TODAS** las llamadas a la API de IA eran bloqueadas por CORS.

**Fix aplicado:**
- `clean-contacts/index.ts`: `util.mejoraok.com` agregado a ALLOWED_ORIGINS
- `google-contacts-auth/index.ts`: `util.mejoraok.com` agregado a ALLOWED_ORIGINS

**Pendiente de deploy:**
```bash
supabase functions deploy clean-contacts
supabase functions deploy google-contacts-auth
```

### 📋 Próximas Etapas Sugeridas

#### Etapa 7 — Verificación Post-Deploy
| # | Tarea | Detalle |
|---|-------|---------|
| 7.1 | Deploy Edge Functions | `supabase functions deploy` (ambas) |
| 7.2 | Test API en vivo | Probar cada proveedor desde la app live |
| 7.3 | Verificar Google OAuth | Test importación desde Google Contacts |
| 7.4 | Monitoreo | Revisar logs de Edge Functions en Supabase Dashboard |

#### Etapa 8 — Mejoras de Proveedores
| # | Tarea | Detalle |
|---|-------|---------|
| 8.1 | Actualizar modelos | Verificar que los modelos siguen activos en cada proveedor |
| 8.2 | Eliminar "lovable" del fallback | Solo funciona en Lovable.dev, no en Hostinger |
| 8.3 | Health check automático | Test periódico de keys desde la UI |
| 8.4 | Modelo por defecto actualizado | Verificar gemini-2.0-flash-exp sigue activo |

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
| Deploy CI/CD | ✅ | GitHub Actions → Hostinger |
| CORS | 🔄 | Fix aplicado, pendiente deploy Edge Functions |
| Tests | ✅ | 150+ tests, 11 archivos |
| Multi-país | ✅ | 21 países con selector |
| Web Worker | ✅ | batchRuleClean + dedup offloaded |
| IndexedDB batched | ✅ | Cursor-based, streamContacts() |
| Bundle splitting | ✅ | xlsx lazy, index 376KB |
| Accesibilidad | ✅ | aria-labels, focus-visible, roles |
| Rate limiting | ✅ | 30 req/min por IP |

## 11. Notas de Seguridad

1. **`.env` no se commitea** — en `.gitignore`, removido del tracking
2. **API keys en localStorage** — el usuario las ingresa manualmente, nunca van al repo
3. **CORS restringido** — whitelist: `util.mejoraok.com`, `mejoraok.com`, `localhost:8080`, `localhost:5173`
4. **XSS en reportes** — `escapeHtml()` aplicado en `generateHTMLReport()`
5. **Supabase anon key** — pública (publishable, no service_role), protegida por RLS
6. **Rate limiting** — 30 req/min por IP en Edge Function, sliding window

---

*Documento consolidado — reemplaza toda documentación previa. Actualizar al decir "documentar".*
