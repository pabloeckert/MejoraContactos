# 📚 MejoraContactos — Documentación Consolidada

> **Instrucción:** Cuando el usuario diga **"documentar"**, actualizar este archivo con el estado actual del proyecto, trabajos realizados y pendientes.

**Última actualización:** 2026-04-23  
**Versión:** v3.1 (post-security-fixes)  
**Repo:** [pabloeckert/MejoraContactos](https://github.com/pabloeckert/MejoraContactos)  
**Live:** https://mejoraok.com/util/mejoracontactos/

---

## 1. Descripción

MejoraContactos es una aplicación web para consolidar, limpiar y deduplicar bases de contactos desde múltiples fuentes heterogéneas (CSV, Excel, VCF, JSON, Google Contacts). Usa un pipeline híbrido: reglas determinísticas + IA con 12 proveedores y rotación automática.

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
| Deploy | GitHub Actions → SSH+SCP → Hostinger |

## 3. Arquitectura

```
src/
├── components/
│   ├── ApiKeysPanel.tsx       # Gestión de keys (UI)
│   ├── ColumnMapper.tsx       # Mapeo manual de columnas
│   ├── ContactsTable.tsx      # Tabla virtualizada con scores
│   ├── DashboardPanel.tsx     # Métricas y gráficos
│   ├── ExportPanel.tsx        # Exportación multi-formato
│   ├── FileDropzone.tsx       # Drag & drop de archivos
│   ├── GoogleContactsPanel.tsx # OAuth multi-cuenta Google
│   ├── ProcessingPanel.tsx    # Pipeline de procesamiento (32KB)
│   └── ui/                    # shadcn/ui components
├── lib/
│   ├── ai-validator.ts        # Validación IA para casos ambiguos
│   ├── api-keys.ts            # Gestión de API keys (localStorage)
│   ├── column-mapper.ts       # Auto-detección de columnas
│   ├── db.ts                  # IndexedDB (CRUD contactos)
│   ├── dedup.ts               # Deduplicación O(n) con hash index
│   ├── export-utils.ts        # Export CSV/Excel/VCF/JSON/JSONL/HTML
│   ├── field-validator.ts     # Validación semántica determinística
│   ├── parsers.ts             # Parseo CSV/Excel/VCF/JSON
│   ├── phone-validator.ts     # Validación telefónica E.164
│   ├── providers.ts           # Config de 12 proveedores IA
│   ├── rule-cleaner.ts        # Limpieza por reglas (80%+ casos)
│   └── utils.ts               # Utilidades (cn)
├── types/
│   └── contact.ts             # Interfaces principales
├── pages/
│   ├── Index.tsx              # Página principal (tabs)
│   └── NotFound.tsx           # 404
└── integrations/
    └── supabase/
        ├── client.ts          # Cliente Supabase
        └── types.ts           # Tipos de DB

supabase/functions/
├── clean-contacts/index.ts    # Edge Function: limpieza con IA
└── google-contacts-auth/      # Edge Function: OAuth Google
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

**Etapas:**
1. **Parseo:** CSV/Excel/VCF/JSON → `ParsedFile` con filas y columnas
2. **Mapeo:** Auto-detección de columnas (nombre, email, teléfono, etc.)
3. **Reglas:** Limpieza determinística (junk, title case, email regex, phone E.164, auto-split nombres)
4. **IA Limpieza:** Solo los contactos que las reglas no pudieron resolver (batch 20-25)
5. **IA Verificación:** Revisión cruzada de la limpieza
6. **IA Corrección:** Fix de issues detectados
7. **Validación:** Scoring semántico por campo (0-100) + IA para ambiguos
8. **Dedup:** Email exacto O(1) → teléfono O(1) → nombre Jaro-Winkler acotado O(k)

## 5. Proveedores de IA

| # | Proveedor | Modelo | Notas |
|---|----------|--------|-------|
| 1 | Groq Cloud | Llama 3.3 70B | Free tier generoso, ultra rápido |
| 2 | OpenRouter | Mistral Small Free | Acceso a modelos free |
| 3 | Together AI | Llama 3.3 70B | Gratis |
| 4 | Cerebras | Llama 3.3 70B | El más rápido |
| 5 | DeepInfra | Llama 3.3 70B | Pay-per-token |
| 6 | SambaNova | Llama 3.3 70B | Free tier diario |
| 7 | Mistral AI | Small | Europeo |
| 8 | DeepSeek | Chat | Muy económico |
| 9 | Google AI Studio | Gemini 2.0 Flash | Free tier generoso |
| 10 | Cloudflare Workers AI | Llama 3.3 70B | Requiere TOKEN:ACCOUNT_ID |
| 11 | Hugging Face | Llama 3.3 70B | Miles de modelos |
| 12 | Nebius AI | Llama 3.3 70B | Free credits |

**Rotación:** Si un proveedor devuelve 429/402/401, rota automáticamente al siguiente. Soporta múltiples keys por proveedor.

## 6. Formatos Soportados

### Importación
| Formato | Parser | Notas |
|---------|--------|-------|
| CSV | PapaParse | UTF-8, auto-detected headers |
| Excel (.xlsx/.xls) | SheetJS | Primera hoja |
| VCF | Parser propio | vCard 3.0, multi-tel |
| JSON | nativo | Array u objeto con array |
| Google Contacts | OAuth + API | Multi-cuenta (hasta 5) |

### Exportación
| Formato | Uso |
|---------|-----|
| CSV | Google Contacts, Excel |
| Excel | 2 hojas (limpios + descartados) |
| VCF | vCard 3.0 para importar en dispositivos |
| JSON | Datos completos con metadata |
| JSONL | Fine-tuning IA (OpenAI/HuggingFace) |
| HTML | Informe imprimible con estadísticas |

## 7. Deploy

**Producción:** https://mejoraok.com/util/mejoracontactos/

**Pipeline CI/CD:**
1. Push a `main` → GitHub Actions trigger
2. `npm ci` + `npm run build`
3. SSH: limpia `assets/` en Hostinger
4. SCP: sube `dist/` al server

**Configuración:**
- `vite.config.ts`: `base: "/mejoracontactos/"` en producción
- `public/.htaccess`: Rewrite rules para SPA
- GitHub Secrets: `SSH_HOST`, `SSH_USER`, `SSH_PASS`, `SSH_PORT`

**Desarrollo local:**
```bash
npm install
npm run dev    # → http://localhost:8080
```

## 8. Registro de Cambios

### v3.1 — 2026-04-23 (Security & Quality Fixes)

**Commit:** `2cb5f07`

| Cambio | Tipo | Archivo |
|--------|------|---------|
| `.env` removido de git tracking | 🔴 Seguridad | `.env` |
| XSS en reporte HTML — `escapeHtml()` | 🔴 Seguridad | `export-utils.ts` |
| `ai-validator.ts` flujo roto — reescrito | 🟡 Bug | `ai-validator.ts` |
| VCF parser regex vaciaba campo FN | 🟡 Bug | `parsers.ts` |
| VCF parser `split(":").pop()` perdía datos | 🟡 Bug | `parsers.ts` |
| `exportCorrectionsCSV` generaba CSV roto | 🟡 Bug | `export-utils.ts` |
| `checkDuplicate` marcada `@deprecated` | 🟠 Mejora | `dedup.ts` |
| `PROVIDERS` extraído a `providers.ts` | 🟠 Mejora | `providers.ts` |
| API keys extraído a `api-keys.ts` | 🟠 Mejora | `api-keys.ts` |
| CORS comment de seguridad | 🟠 Mejora | `clean-contacts/index.ts` |
| HMR warnings 8 → 3 | 🟠 Mejora | múltiples |

### v3.0 — 2026-04-22 (Fases 1-8 completadas)

Commits: `95ab556`, `273c3a3`, `b5f1579`, `8239f22`

- Deploy funcional con CI/CD
- Validación telefónica E.164 con WhatsApp
- Validación semántica determinística
- Dedup O(n) con hash index
- Google Contacts multi-cuenta
- Exportación JSONL + informes HTML
- UX/UI responsiva + dark mode
- Validación IA para casos ambiguos
- Pipeline 3 etapas (limpiar → verificar → corregir)

## 9. Plan de Trabajo — Etapas Restantes

### Estado general: ✅ Core completo | 🔧 Hardening pendiente

---

### Etapa 1 — Testing (🔴 Alta prioridad)
**Objetivo:** Cobertura de tests para lógica crítica  
**Esfuerzo:** ~1 día

| # | Tarea | Detalle | Estado |
|---|-------|---------|--------|
| 1.1 | Tests unitarios para `dedup.ts` | Jaro-Winkler, DedupIndex, edge cases | ⬜ |
| 1.2 | Tests unitarios para `rule-cleaner.ts` | titleCase, cleanJunk, cleanEmail, autoSplit, extractHonorific | ⬜ |
| 1.3 | Tests unitarios para `phone-validator.ts` | Formatos AR/MX/ES, E.164, WhatsApp detection | ⬜ |
| 1.4 | Tests unitarios para `field-validator.ts` | Cada validador de campo, scores, edge cases | ⬜ |
| 1.5 | Tests unitarios para `parsers.ts` | CSV, Excel, VCF (incluyendo edge cases corregidos), JSON | ⬜ |
| 1.6 | Tests para `column-mapper.ts` | Auto-detección con nombres en español/inglés | ⬜ |
| 1.7 | Tests para `export-utils.ts` | CSV escaping, VCF format, HTML report (XSS) | ⬜ |

**Entregable:** `npm test` pasa con cobertura >80% en `src/lib/`.

---

### Etapa 2 — Configuración Multi-País (🟡 Media prioridad)
**Objetivo:** Eliminar hardcode de Argentina  
**Esfuerzo:** ~4 horas

| # | Tarea | Detalle | Estado |
|---|-------|---------|--------|
| 2.1 | Selector de país en UI | Dropdown en ProcessingPanel para país default | ⬜ |
| 2.2 | Pasar país a `ruleClean()` | Recibir `defaultCountry` como parámetro | ⬜ |
| 2.3 | Pasar país a `validateContactFields()` | Propagar a `validateWhatsAppField` | ⬜ |
| 2.4 | Auto-detección por fuente | Si viene de Google Contacts, usar el country del usuario | ⬜ |

**Entregable:** La app funciona correctamente con contactos de AR, MX, ES, CO, CL, etc.

---

### Etapa 3 — Refactor de ProcessingPanel (🟡 Media prioridad)
**Objetivo:** Dividir componente de 32KB en módulos manejables  
**Esfuerzo:** ~1 día

| # | Tarea | Detalle | Estado |
|---|-------|---------|--------|
| 3.1 | Extraer `useContactProcessing` hook | Toda la lógica de pipeline en un hook separado | ⬜ |
| 3.2 | Extraer tipos a `types/processing.ts` | `PipelineState`, `StageConfig`, etc. | ⬜ |
| 3.3 | Componente `PipelineVisualizer` | El tracker visual de etapas como componente propio | ⬜ |
| 3.4 | Componente `StageConfigurator` | Los selectores de proveedor por etapa | ⬜ |

**Entregable:** `ProcessingPanel.tsx` < 10KB, lógica testeable.

---

### Etapa 4 — CORS y Seguridad de Edge Function (🟢 Baja prioridad)
**Objetivo:** Restringir acceso a la Edge Function  
**Esfuerzo:** ~2 horas

| # | Tarea | Detalle | Estado |
|---|-------|---------|--------|
| 4.1 | Definir origins permitidos | Deploy URLs (mejoraok.com, localhost:8080) | ⬜ |
| 4.2 | Actualizar CORS headers | Reemplazar `*` por lista blanca | ⬜ |
| 4.3 | Rate limiting básico | Limitar requests por IP en la Edge Function | ⬜ |

**Entregable:** Solo orígenes autorizados pueden llamar a la Edge Function.

---

### Etapa 5 — Optimizaciones Menores (🟢 Baja prioridad)
**Objetivo:** Polish y mejoras incrementales  
**Esfuerzo:** ~4 horas

| # | Tarea | Detalle | Estado |
|---|-------|---------|--------|
| 5.1 | Paginación en IndexedDB | Cursor-based en vez de `getAll()` para 50K+ contactos | ⬜ |
| 5.2 | Actualizar caniuse-lite | `npx update-browserslist-db@latest` | ⬜ |
| 5.3 | Web Worker para pipeline | Mover limpieza pesada a background thread | ⬜ |
| 5.4 | Accesibilidad | aria-labels, focus visible, keyboard nav en tabla | ⬜ |

**Entregable:** App más robusta para datasets grandes.

---

## 10. Resumen de Estado

| Componente | Estado | Notas |
|-----------|--------|-------|
| Parseo multi-formato | ✅ | CSV, Excel, VCF, JSON |
| Mapeo automático | ✅ | Español + inglés |
| Limpieza por reglas | ✅ | 80%+ de casos |
| Limpieza por IA | ✅ | 12 proveedores, rotación |
| Pipeline 3 etapas | ✅ | Limpiar → Verificar → Corregir |
| Validación semántica | ✅ | Scoring 0-100 por campo |
| Validación telefónica | ✅ | E.164, WhatsApp, multi-país |
| Deduplicación | ✅ | O(n) con hash index |
| Google Contacts | ✅ | Multi-cuenta OAuth |
| Exportación | ✅ | CSV, Excel, VCF, JSON, JSONL, HTML |
| Dashboard | ✅ | Métricas + gráficos |
| Dark mode | ✅ | next-themes |
| Deploy CI/CD | ✅ | GitHub Actions → Hostinger |
| Seguridad | ✅ | .env, XSS, CORS documented |
| Tests | ❌ | Etapa 1 pendiente |
| Multi-país UI | ❌ | Etapa 2 pendiente |
| Refactor ProcessingPanel | ❌ | Etapa 3 pendiente |

---

## 11. Notas de Seguridad

1. **`.env` no debe commitearse** — ya está en `.gitignore` y removido del tracking
2. **API keys en localStorage** — el usuario las ingresa manualmente, nunca se envían al repo
3. **Edge Function CORS** — actualmente `*`, documentado para restringir
4. **XSS en reportes** — `escapeHtml()` aplicado en `generateHTMLReport()`
5. **Supabase anon key** — expuesta en `.env` (publikable, no service_role), protegida por RLS

---

*Documento consolidado — reemplaza: PLAN_MEJORA_v3.md, Informe_MejoraApp_v2.docx, MejoraContactos_2026-04-20_2129.docx*
