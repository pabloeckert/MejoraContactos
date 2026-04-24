# 🔬 Análisis Profundo Multidisciplinario — MejoraContactos

> **Fecha:** 2026-04-24 21:10 GMT+8
> **Versión analizada:** v5.0 (`309ea00`)
> **Repo:** [pabloeckert/MejoraContactos](https://github.com/pabloeckert/MejoraContactos)
> **Live:** https://util.mejoraok.com/mejoracontactos/

---

## Tabla de Contenidos

1. [Área Técnica](#1-área-técnica)
2. [Área de Producto y Gestión](#2-área-de-producto-y-gestión)
3. [Área Comercial y de Crecimiento](#3-área-comercial-y-de-crecimiento)
4. [Área de Operaciones, Legal y Análisis](#4-área-de-operaciones-legal-y-análisis)
5. [Plan por Etapas (Optimizado)](#5-plan-por-etapas-optimizado)
6. [Documentación Consolidada](#6-documentación-consolidada)

---

# 1. Área Técnica

## 1.1 Software Architect

### Arquitectura General
- **Patrón:** SPA monolítica con Edge Functions serverless
- **Frontend:** React 18 + Vite + TypeScript — SPA client-side pesada
- **Backend:** Supabase Edge Functions (Deno) — solo para IA y OAuth
- **Persistencia:** IndexedDB (local) + Supabase (remoto, solo auth)
- **Deploy:** GitHub Actions → SCP → Hostinger (VPS compartido)

### Evaluación

| Aspecto | Score | Notas |
|---------|-------|-------|
| Separación de responsabilidades | ⭐⭐⭐⭐ | Libs bien separadas, hooks puros, components UI-only |
| Escalabilidad horizontal | ⭐⭐ | Sin CDN, Hostinger compartido, Edge Functions sin colas |
| Resiliencia | ⭐⭐⭐ | Rotación de proveedores IA, pero sin circuit breaker formal |
| Acoplamiento | ⭐⭐⭐⭐ | Bajo acoplamiento entre módulos, IndexedDB como aislador |
| Observabilidad | ⭐⭐ | Sin APM, sin logging estructurado, sin métricas backend |

### Recomendaciones
1. **Circuit Breaker formal:** La rotación de proveedores es ad-hoc. Implementar patrón circuit breaker con estados (closed/open/half-open) en vez de simplemente intentar el siguiente en 429/402/401.
2. **Cola de procesamiento:** Los batchs de IA se procesan inline. Para datasets grandes (+50K), una cola con backpressure evitaría timeouts.
3. **CDN:** Hostinger no tiene CDN nativo. Cloudflare free tier resolvería cache de assets + DDoS básico.
4. **Monitoreo:** Sin Datadog/Grafana/sentry, los errores de producción son invisibles. Mínimo: Sentry para errores.

---

## 1.2 Cloud Architect

### Infraestructura Actual

```
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│   GitHub         │────▶│  GitHub Actions      │────▶│  Hostinger VPS   │
│   (source)       │     │  (CI/CD)            │     │  (SSH/SCP)       │
└──────────────────┘     └─────────────────────┘     └──────────────────┘
                                                            │
                                                    ┌───────▼───────┐
                                                    │ Static files  │
                                                    │ + .htaccess   │
                                                    └───────────────┘

┌──────────────────┐     ┌─────────────────────┐
│  Browser (user)  │────▶│  Supabase Edge Fn   │
│  (IndexedDB)     │     │  (Deno, serverless) │
└──────────────────┘     └─────────────────────┘
```

### Evaluación

| Aspecto | Estado | Riesgo |
|---------|--------|--------|
| Hosting | Hostinger compartido | Alto — sin SLA, sin auto-scaling, IP compartida |
| Serverless | Supabase Edge Functions | Medio — cold starts, límites de ejecución |
| DNS | `util.mejoraok.com` → Hostinger | Medio — sin CDN, sin failover |
| Secrets | GitHub Secrets (SSH creds) | Bajo — correcto |
| Database | IndexedDB (solo cliente) | Alto — datos se pierden al limpiar browser |
| Supabase DB | No usado para contacts | Medio — infraestructura pagada sin aprovechar |

### Recomendaciones
1. **Migrar a Vercel/Netlify:** El frontend es SPA estática — Vercel free tier daría CDN global, SSL automático, preview deploys.
2. **Usar Supabase DB:** El proyecto ya paga Supabase. Almacenar contactos procesados en PostgreSQL daría persistencia real, multi-device, y backup.
3. **Multi-region Edge Functions:** Supabase Edge Functions ya es multi-region (Deno Deploy). No hay acción adicional.
4. **Cloudflare como proxy:** SSL + CDN + DDoS protection gratis.

---

## 1.3 Backend Developer

### Edge Function: `clean-contacts/index.ts`

**Fortalezas:**
- Rate limiting con sliding window (30 req/min/IP)
- CORS whitelist correcto
- Rotación automática de keys con múltiples proveedores
- Parsing de respuestas robusto con fallback

**Debilidades:**
- Rate limit en memoria (`Map<string, number[]>`) — se pierde en cold start, no es compartido entre instancias
- Sin validación de input con schema (Zod existe en frontend pero no en Edge Function)
- Sin retry con exponential backoff en llamadas a proveedores IA
- Sin timeout configurable por proveedor
- Logging mínimo (solo `console.error`)

### Recomendaciones
1. **Rate limit en Supabase DB:** Usar tabla `rate_limits` con TTL para persistencia cross-instance.
2. **Zod en Edge Function:** Validar body de request con el mismo schema del frontend.
3. **Retry policy:** Implementar exponential backoff con jitter (1s, 2s, 4s + random 0-500ms).
4. **Timeout diferenciado:** Groq responde en <1s, Hugging Face puede tardar 30s. Configurar por proveedor.
5. **Structured logging:** `console.log(JSON.stringify({level, msg, provider, latencyMs, ...}))` para filtrado en Supabase Logs.

---

## 1.4 Frontend Developer

### Evaluación del Código

| Aspecto | Score | Detalle |
|---------|-------|---------|
| TypeScript | ⭐⭐⭐⭐ | Estricto, bien tipado, interfaces claras |
| Componentes | ⭐⭐⭐⭐ | shadcn/ui consistente, composición correcta |
| State management | ⭐⭐⭐ | `useState` + `useCallback` — suficiente para el caso, sin over-engineering |
| Performance | ⭐⭐⭐⭐ | Tabla virtualizada, lazy xlsx, Web Workers, chunk splitting |
| Accesibilidad | ⭐⭐⭐ | aria-labels, focus-visible, pero sin tests E2E de a11y |
| Responsive | ⭐⭐⭐ | Funcional pero no mobile-first optimizado |
| Testing | ⭐⭐⭐⭐ | 150 tests unitarios con vitest + testing-library |

### Código Problemático Detectado

1. **`useContactProcessing.ts` (407 líneas):** Demasiado grande para un hook. Debería dividirse en `usePipeline`, `useDedup`, `useValidation`.
2. **`db.ts`:** La función `getAllContacts()` carga todo en memoria. `streamContacts()` existe pero no se usa en todos los flujos.
3. **`Index.tsx`:** Demasiado estado en un solo componente padre (prop drilling hacia abajo).

### Recomendaciones
1. **Dividir hooks:** `useContactProcessing` → `usePipeline` + `useDedup` + `useValidation`
2. **Context API o Zustand:** Para estado global de contacts, reemplazar prop drilling.
3. **Error Boundaries:** No hay React Error Boundaries — un error en un componente rompe toda la app.
4. **React.memo:** Algunos componentes hijos se re-renderizan innecesariamente (ContactsTable, ExportPanel).
5. **Suspense + lazy:** Solo `xlsx` es lazy. Los componentes de tabs podrían serlo también.

---

## 1.5 iOS Developer

### Evaluación
La app es **web-only** (SPA). No hay app nativa iOS ni PWA.

| Aspecto | Estado | Impacto |
|---------|--------|---------|
| PWA | ❌ No implementada | Alto — usuarios móviles no pueden "instalar" |
| Service Worker | ❌ No implementado | Alto — sin offline |
| Touch optimization | ⭐⭐ | FileDropzone funciona, pero drag & drop es limitado en iOS |
| Safari compat | ⭐⭐⭐ | Sin issues conocidos, pero no testeado explícitamente |
| App Clips / Deep Links | ❌ | N/A para web |

### Recomendaciones
1. **PWA básica:** `manifest.json` + Service Worker para cache de assets. Esfuerzo bajo, impacto alto.
2. **Touch gestures:** Mejorar FileDropzone para iOS (long-press → file picker nativo).
3. **Share target:** Permitir compartir archivos de contactos desde otras apps a MejoraContactos.
4. **Futuro:** Si se necesita app nativa, Capacitor o Expo darían wrapper con acceso a contactos nativos del dispositivo.

---

## 1.6 Android Developer

### Evaluación
Similar a iOS — web-only. Android tiene mejor soporte PWA que iOS.

| Aspecto | Estado | Impacto |
|---------|--------|---------|
| PWA | ❌ | Alto |
| TWA (Trusted Web Activity) | ❌ | Medio — para publicar en Play Store como web wrapper |
| File handling | ⭐⭐⭐⭐ | Android permite file picker nativo desde web |
| Share intent | ❌ | Medio — no se puede compartir contactos desde apps nativas |

### Recomendaciones
1. **PWA:** Mismo que iOS — prioridad alta.
2. **TWA:** Si se quiere presencia en Play Store, TWA es trivial con Bubblewrap.
3. **Contact Picker API:** Web Contact Picker API (Chrome Android) podría permitir importar directamente sin archivos.

---

## 1.7 DevOps Engineer

### Pipeline CI/CD Actual

```yaml
Trigger: push to main
Steps:
  1. checkout
  2. setup-node 22
  3. npm ci
  4. npm test
  5. npm run build
  6. SSH: rm -rf assets/*
  7. SCP: dist/* → Hostinger
```

### Evaluación

| Aspecto | Score | Detalle |
|---------|-------|---------|
| Automatización | ⭐⭐⭐⭐ | Push-to-deploy funciona |
| Rollback | ⭐ | No hay mecanismo de rollback (SCP sobreescribe) |
| Staging | ⭐ | No hay environment de staging |
| Edge Functions | ⚠️ | Deploy manual — se olvida fácil |
| Health checks | ⭐⭐ | Sin smoke test post-deploy |
| Secrets rotation | ⭐⭐ | GitHub Secrets estáticos |

### Recomendaciones
1. **Rollback automático:** Antes de SCP, hacer backup de `dist/` en el server. Si health check falla, restaurar.
2. **Staging branch:** Crear `staging` con deploy automático a subdominio `staging.util.mejoraok.com`.
3. **Edge Functions auto-deploy:** Agregar paso en GitHub Actions con `supabase functions deploy`.
4. **Smoke test post-deploy:** `curl -s -o /dev/null -w "%{http_code}" https://util.mejoraok.com/mejoracontactos/` + verificar que no sea 500.
5. **Deploy de Edge Functions en CI:** Usar `SUPABASE_ACCESS_TOKEN` en GitHub Secrets.

---

## 1.8 Site Reliability Engineer (SRE)

### SLOs Actuales (implícitos)

| Métrica | SLO Actual | SLO Recomendado |
|---------|-----------|-----------------|
| Disponibilidad frontend | ~99% (Hostinger sin SLA) | 99.9% |
| Latencia P95 (page load) | ~3-5s (sin CDN) | <2s |
| Error rate (IA calls) | Desconocido (sin monitoreo) | <5% |
| Deploy frequency | ~2-3/día (manual) | On-demand |
| MTTR | Desconocido | <30min |

### Recomendaciones
1. **Uptime monitoring:** UptimeRobot o BetterStack (gratis) — alertar si el site cae.
2. **Error tracking:** Sentry (free tier) — capturar errores de JavaScript en producción.
3. **Performance monitoring:** Web Vitals con `web-vitals` library → enviar a analytics.
4. **Runbook:** Documentar procedimientos para: deploy fallido, Edge Function caída, proveedor IA down.
5. **Alertas:** Configurar alertas en Supabase para: error rate >10%, latencia >5s, uso de Edge Functions >80% del free tier.

---

## 1.9 Cybersecurity Architect

### Evaluación de Seguridad

| Área | Score | Detalle |
|------|-------|---------|
| XSS | ⭐⭐⭐⭐ | `escapeHtml()` en reportes HTML, React escapa por defecto |
| CORS | ⭐⭐⭐⭐ | Whitelist correcta, 4 origins permitidos |
| API keys | ⭐⭐⭐ | En localStorage (client-side), nunca en repo |
| Rate limiting | ⭐⭐⭐ | 30 req/min/IP, pero en memoria (no persistente) |
| Input validation | ⭐⭐ | Frontend tiene Zod, Edge Function no valida input |
| Secrets management | ⭐⭐⭐ | `.env` en gitignore, GitHub Secrets para deploy |
| Supabase anon key | ⭐⭐⭐⭐ | Pública, protegida por RLS |
| Dependencies | ⭐⭐⭐ | Sin vulnerabilities conocidas, pero sin audit automático |

### Riesgos Identificados

1. **🔴 Alto — XSS en IndexedDB:** Los contactos se almacenan crudos en IndexedDB. Si un contacto contiene `<script>` y se renderiza sin escape, es XSS. Actualmente React escapa, pero un `dangerouslySetInnerHTML` futuro sería vulnerable.
2. **🟡 Medio — API keys en localStorage:** Cualquier script de terceros (analytics, ads) puede acceder a `localStorage`. Usar `sessionStorage` o encriptar con Web Crypto API.
3. **🟡 Medio — Sin CSP:** No hay `Content-Security-Policy` header. Hostinger no lo configura por defecto.
4. **🟡 Medio — Edge Function sin auth:** El endpoint `clean-contacts` no verifica JWT de Supabase. Cualquiera con la URL puede llamarlo (solo rate limit lo protege).
5. **🟢 Bajo — Git history:** Commits anteriores podrían tener datos sensibles. `git log -p` no muestra .env, pero sí muestra Supabase URL/keys públicas.

### Recomendaciones
1. **CSP Header:** Agregar en `.htaccess`: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`
2. **Auth en Edge Function:** Verificar `Authorization: Bearer <token>` con Supabase JWT.
3. **Encriptar API keys:** Usar Web Crypto API para encriptar keys en localStorage con clave derivada del usuario.
4. **npm audit:** Agregar `npm audit --audit-level=high` al pipeline CI.
5. **SRI (Subresource Integrity):** Para scripts de terceros si se agregan.

---

## 1.10 Data Engineer

### Flujo de Datos

```
Archivos (CSV/Excel/VCF/JSON) → Parser → IndexedDB → Pipeline → IndexedDB → Export
Google Contacts ──(OAuth)──→ API People → ──┘                              ↓
                                                                     CSV/Excel/VCF/JSON/JSONL/HTML
```

### Evaluación

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Data quality | ⭐⭐⭐⭐ | Validación semántica 0-100, scoring por campo |
| Data lineage | ⭐ | Sin tracking de transformaciones |
| Data versioning | ⭐⭐ | History/undo con snapshots, pero limitado a 10 |
| ETL pipeline | ⭐⭐⭐ | Bien estructurado en etapas, pero inline (no orquestado) |
| Data validation | ⭐⭐⭐⭐ | Zod + field-validator + phone-validator |
| Schema evolution | ⭐⭐ | `UnifiedContact` es rígido, sin migración de schema |

### Recomendaciones
1. **Data lineage:** Agregar campo `transformations: string[]` a cada contacto para trackear qué pasos aplicaron.
2. **Schema versioning:** Agregar `schemaVersion` a IndexedDB para migraciones futuras.
3. **Export de metadatos:** Incluir en el export JSON un objeto `metadata` con: fecha de procesamiento, proveedores usados, reglas aplicadas, scores promedio.
4. **Data quality dashboard:** El DashboardPanel ya tiene métricas — agregar tendencia temporal (últimas 5 limpiezas).

---

## 1.11 Machine Learning Engineer

### Uso de IA Actual

- **No es ML propio** — usa modelos de terceros vía API (Llama 3.3, Gemini, etc.)
- **Prompt engineering:** Los prompts están hardcodeados en Edge Functions
- **Sin fine-tuning:** El JSONL export existe pero no hay pipeline de fine-tuning
- **Sin embeddings:** La deduplicación es determinística (hash + Jaro-Winkler), no semántica
- **Cache:** `ai-validator.ts` tiene cache simple para evitar re-llamar IA

### Recomendaciones
1. **Embeddings para dedup:** Usar un modelo de embeddings (e.g., `text-embedding-3-small` de OpenRouter) para detectar duplicados semánticos que Jaro-Winkler no atrapa.
2. **Fine-tuning pipeline:** El JSONL export ya tiene el formato correcto. Crear un script que: JSONL → upload a OpenAI/HF → fine-tune → evaluar → deploy.
3. **Prompt versioning:** Los prompts están en el código. Moverlos a una constante versionada para A/B testing.
4. **Evaluation dataset:** Crear un set de 100 contactos "golden" con respuestas esperadas para evaluar calidad de limpieza.
5. **Confidence scoring:** La IA devuelve texto libre. Parsear la confianza del modelo y usarla para decidir si aplicar o pedir revisión humana.

---

## 1.12 QA Automation Engineer

### Testing Actual

| Tipo | Cantidad | Cobertura |
|------|----------|-----------|
| Unit tests | 150 | ⭐⭐⭐⭐ (buenas para el tamaño del proyecto) |
| Integration tests | 0 | ❌ |
| E2E tests | 0 | ❌ |
| Visual regression | 0 | ❌ |
| Performance tests | 0 | ❌ |
| A11y tests | 0 | ❌ |

### Tests Existentes (11 archivos)
- `phone-validator.test.ts` — validación telefónica
- `dedup.test.ts` — deduplicación
- `parsers.test.ts` — parseo de formatos
- `field-validator.test.ts` — validación de campos
- `export-utils.test.ts` — exportación
- `rule-cleaner.test.ts` — limpieza por reglas
- `column-mapper.test.ts` — mapeo de columnas
- `ColumnMapper.test.tsx` — componente UI
- `PipelineVisualizer.test.tsx` — componente UI
- `ExportPanel.test.tsx` — componente UI
- `useContactProcessing.test.ts` — hook

### Recomendaciones
1. **E2E con Playwright:** Tests críticos: importar CSV → procesar → verificar → exportar. Prioridad alta.
2. **Integration tests:** Test de Edge Function con Supabase local (`npx supabase start`).
3. **Visual regression:** Chromatic o Percy para detectar cambios visuales no intencionados.
4. **Performance budget:** Test que falle si el bundle >400KB o el FCP >3s.
5. **A11y automated:** `axe-core` + `vitest-axe` para tests de accesibilidad automáticos.
6. **Coverage report:** `vitest run --coverage` — establecer mínimo de 70% lines.

---

## 1.13 Database Administrator (DBA)

### Almacenamiento Actual

| Store | Tipo | Datos |
|-------|------|-------|
| IndexedDB `contacts` | Client-side | Contactos procesados (UnifiedContact) |
| IndexedDB `history` | Client-side | Snapshots pre-limpieza (max 10) |
| localStorage | Client-side | API keys, preferencias UI |
| Supabase PostgreSQL | Server-side | No usado para contacts |

### Evaluación

| Aspecto | Estado | Riesgo |
|---------|--------|--------|
| Persistencia | ⭐⭐ | IndexedDB se borra al limpiar datos del browser |
| Backup | ❌ | Sin backup de datos del usuario |
| Multi-device | ❌ | Datos solo en un browser |
| Queries | ⭐⭐⭐ | Indexes en email, whatsapp, source |
| Migration | ⭐⭐ | DB_VERSION=3 con upgrade, pero sin rollback |
| Concurrency | ⭐⭐ | Transacciones simples, sin optimistic locking |

### Recomendaciones
1. **Export automático:** Ofrecer auto-export a archivo antes de cada limpieza (el usuario tiene los datos).
2. **Supabase sync:** Opcionalmente sincronizar contacts a Supabase para backup y multi-device.
3. **Compresión:** Para 50K+ contacts, IndexedDB puede pesar >100MB. Implementar compresión LZ-string.
4. **Cursor pagination:** `getAllContacts()` ya usa cursor, pero `saveContacts()` hace put individual. Usar batch.
5. **Vacuum:** Cuando se borran muchos duplicados, el store no se compacta. Implementar `clear + re-save` periódico.

---

# 2. Área de Producto y Gestión

## 2.1 Product Manager

### Propuesta de Valor
**"Limpia, deduplica y unifica bases de contactos desde cualquier fuente, usando IA con 12 proveedores y sin costo de plataforma."**

### Mercado Objetivo
- Profesionales con múltiples agendas dispersas (CRM, teléfono, email, LinkedIn)
- PYMEs con bases de contactos desordenadas
- Usuarios individuales migrando entre dispositivos/plataformas

### Análisis Competitivo

| Competidor | MejoraContactos vs. |
|-----------|-------------------|
| FullContact | MC es gratis (solo costo de API), FullContact es SaaS caro |
| Google Contacts | MC dedup es superior (Jaro-Winkler), Google solo exact match |
| Dedupely | MC es self-hosted, Dedupely es cloud-only |
| Scrubly | MC tiene IA, Scrubly es solo reglas |

### Diferenciadores Clave
1. 12 proveedores IA con rotación automática (resiliencia)
2. Pipeline híbrido: reglas (80%) + IA (20%) = rápido + inteligente
3. Gratuito (el usuario paga solo la API que usa)
4. Multi-formato: 5 formatos de entrada, 6 de salida
5. Privacy-first: todo procesa en el browser del usuario

### Recomendaciones
1. **Freemium model:** Versión gratis con 1000 contactos, premium con ilimitado + IA avanzada.
2. **Onboarding wizard:** Primera vez que un usuario importa, guiar paso a paso.
3. **Valor agregado:** No solo limpiar — sugerir "te faltan estos campos" o "estos contactos están obsoletos".

---

## 2.2 Product Owner

### Backlog Priorizado (MoSCoW)

**Must Have (ya existen):**
- ✅ Importación multi-formato
- ✅ Limpieza por reglas + IA
- ✅ Deduplicación
- ✅ Exportación multi-formato
- ✅ Google Contacts OAuth

**Should Have:**
- PWA offline
- Monitoreo de Edge Functions
- Test end-to-end con usuario real

**Could Have:**
- Fine-tuning pipeline
- Embeddings para dedup semántica
- Multi-idioma UI
- Batch progress real (streaming)

**Won't Have (por ahora):**
- App nativa iOS/Android
- CRM integration (Salesforce, HubSpot)
- Multi-tenant / SaaS

### Velocity del Equipo
- **Equipo:** 1 desarrollador + IA asistente
- **Velocidad:** ~3-5 features por día (impresionante para equipo de 1)
- **Deuda técnica acumulada:** Moderada (ver recomendaciones técnicas)

---

## 2.3 Scrum Master / Agile Coach

### Observaciones del Proceso

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Sprints | ❌ | No hay sprints definidos — desarrollo continuo |
| Planning | ⭐⭐ | Tareas se definen ad-hoc |
| Retrospectivas | ❌ | No documentadas |
| Daily standup | N/A | Equipo de 1 |
| Definition of Done | ⭐⭐⭐ | Tests pasan + deploy verificado |
| Documentation | ⭐⭐⭐⭐ | DOCS.md consolidado, se actualiza |

### Recomendaciones
1. **Kanban ligero:** No necesita Scrum full, pero un board con TODO → IN PROGRESS → DONE ayudaría visibilidad.
2. **Sprints de 1 semana:** Para un equipo de 1, sprints cortos mantienen foco.
3. **Retro semanal:** 15 min al viernes: ¿qué funcionó? ¿qué no? ¿qué cambiar?
4. **Definition of Done explícita:** Tests pasan + build OK + deploy verificado + docs actualizadas.

---

## 2.4 UX Researcher

### Hipótesis de Usuario

**Usuario primario:** Profesional con 500-5000 contactos en múltiples fuentes
- **Pain point:** Contactos duplicados, datos inconsistentes, formatos mezclados
- **Job to be done:** "Quiero una agenda limpia y unificada sin perder información"
- **Fricción actual:** Herramientas existentes son caras, complejas, o no tienen IA

### Recomendaciones
1. **Entrevistas de usuario:** 5-10 entrevistas con usuarios reales para validar hipótesis.
2. **Analytics:** Implementar eventos básicos: archivos importados, tamaño promedio, formatos más usados, tasa de completado del pipeline.
3. **Encuesta post-uso:** "¿Cuántos contactos limpiaste? ¿Cuántos duplicados encontraste? ¿Volverías a usar?"
4. **Test de usabilidad:** Observar a 3 usuarios usar la app por primera vez. Anotar puntos de confusión.

---

## 2.5 UX Designer

### Evaluación de Experiencia

| Aspecto | Score | Detalle |
|---------|-------|---------|
| Onboarding | ⭐⭐ | Sin guía de primera vez — el usuario se enfrenta a 6 tabs |
| Flujo principal | ⭐⭐⭐⭐ | Importar → Procesar → Revisar → Exportar es claro |
| Feedback visual | ⭐⭐⭐⭐ | Pipeline visualizer es excelente para progreso |
| Error handling | ⭐⭐⭐ | Toasts informativos, pero sin recovery paths claros |
| Undo | ⭐⭐⭐⭐ | Historial con deshacer — buen patrón |
| Cognitive load | ⭐⭐ | 6 tabs + múltiples opciones de IA pueden abrumar |

### Problemas de UX

1. **Abandono en primer uso:** El usuario ve 6 tabs y no sabe por dónde empezar.
2. **Configuración de IA:** Elegir entre 12 proveedores es overwhelming. El usuario no sabe cuál es mejor.
3. **Sin preview de resultados:** El usuario no ve qué va a cambiar antes de procesar.
4. **Exportación confusa:** 6 formatos — ¿cuál necesito?

### Recomendaciones
1. **Wizard de primera vez:** 3 pasos: (1) Importa tus contactos, (2) Elige un plan de limpieza, (3) Revisa y exporta.
2. **Modo simple vs avanzado:** Simple: "Limpia mis contactos" (usa defaults). Avanzado: configuración manual.
3. **Preview antes de procesar:** Mostrar "se encontraron 234 duplicados, 156 emails inválidos" antes de aplicar.
4. **Recomendación de formato:** "Si vas a importar a Google Contacts, usa VCF" — contextual.

---

## 2.6 UI Designer

### Evaluación Visual

| Aspecto | Score | Detalle |
|---------|-------|---------|
| Consistencia | ⭐⭐⭐⭐ | shadcn/ui garantiza consistencia |
| Jerarquía visual | ⭐⭐⭐ | Buena, pero podría mejorarse con más contraste |
| Dark mode | ⭐⭐⭐⭐ | Implementado con next-themes, funciona bien |
| Iconografía | ⭐⭐⭐⭐ | Lucide icons consistentes |
| Espaciado | ⭐⭐⭐ | Correcto pero a veces apretado en mobile |
| Animaciones | ⭐⭐ | PipelineVisualizer tiene transiciones, el resto es estático |

### Recomendaciones
1. **Micro-animaciones:** Fade-in al cambiar de tab, slide-in para paneles laterales.
2. **Estados vacíos:** Mejorar los empty states con ilustraciones y CTAs claros.
3. **Skeleton loading:** Mostrar skeletons mientras se cargan datos de IndexedDB.
4. **Responsive breakpoints:** Optimizar para tablet (768px-1024px) — actualmente desktop-first.
5. **Tema personalizable:** Permitir al usuario elegir color de acento.

---

## 2.7 UX Writer

### Copy Actual

| Elemento | Calidad | Ejemplo |
|----------|---------|---------|
| Títulos de tabs | ⭐⭐⭐⭐ | "Importar", "Procesar", "Resultados" — claros |
| Mensajes de error | ⭐⭐⭐ | "Error guardando en base de datos local" — técnico |
| Tooltips | ⭐⭐⭐ | Presentes pero breves |
| CTAs | ⭐⭐⭐ | "Procesar Contactos" — funcional pero genérico |
| Empty states | ⭐⭐ | "Arrastra archivos aquí" — mínimo |

### Recomendaciones
1. **Tono humano:** "¡Listo! Encontramos 234 duplicados" en vez de "Deduplicación completada: 234".
2. **Mensajes de error con acción:** "No pudimos guardar. Verificá tu espacio de almacenamiento del navegador" en vez de "Error guardando en base de datos local".
3. **Contexto en tooltips:** "Pipeline 3 IAs: usa 3 proveedores distintos para máxima calidad" vs solo "Pipeline 3 IAs".
4. **Microcopy de onboarding:** "Empezá por acá →" en la primera tab.

---

## 2.8 Localization Manager

### Estado de Internacionalización

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| UI idioma | 🇪🇸 Español únicamente | Hardcoded en componentes |
| Código | 🇬🇧 Inglés | Nombres de variables, funciones, archivos |
| i18n framework | ❌ No implementado | Sin react-intl, i18next, ni similar |
| Formatos locales | ⭐⭐⭐⭐ | 21 países con códigos telefónicos |
| Fechas | ⭐⭐ | date-fns pero sin locale-aware formatting |

### Recomendaciones
1. **i18n con react-intl o i18next:** Extraer strings de UI a archivos de traducción.
2. **Prioridad de idiomas:** Inglés (global), Portugués (Brasil, mercado grande), Francés.
3. **Locale detection:** Detectar idioma del browser y mostrar UI correspondiente.
4. **RTL support:** Si se expande a árabe/hebreo, preparar layout para right-to-left.

---

## 2.9 Delivery Manager

### Estado del Delivery

| Métrica | Valor | Evaluación |
|---------|-------|------------|
| Lead time (feature → deploy) | <1 día | ⭐⭐⭐⭐⭐ Excepcional |
| Deploy frequency | 2-3/día | ⭐⭐⭐⭐⭐ |
| Change failure rate | ~10% (fixes post-deploy) | ⭐⭐⭐ |
| MTTR (Mean Time to Recovery) | ~30 min (fix + push) | ⭐⭐⭐⭐ |
| Documentation freshness | Actualizada | ⭐⭐⭐⭐ |

### Recomendaciones
1. **Feature flags:** Para features grandes, deploy desactivado y activar gradualmente.
2. **Canary deploys:** Probar con % de tráfico antes de 100%.
3. **Post-mortem ligero:** Cuando algo falla en prod, documentar causa y prevención en 5 min.

---

# 3. Área Comercial y de Crecimiento

## 3.1 Growth Manager

### Métricas de Crecimiento (estimadas)

| Métrica | Valor estimado | Potencial |
|---------|---------------|-----------|
| Usuarios únicos/mes | Desconocido (sin analytics) | ⭐⭐⭐ Alto si se comercializa |
| Viralidad | Baja (herramienta personal) | ⭐⭐ |
| Retención | Media (uso one-shot) | ⭐⭐ |
| Monetización | $0 actualmente | ⭐⭐⭐⭐ Alto potencial |

### Recomendaciones
1. **Analytics básico:** Umami (self-hosted, privacy-first) o Plausible — saber cuántos usuarios hay.
2. **Viral loop:** "Comparte tu resultado" — mostrar "limpié 234 contactos, encontré 56 duplicados" con link a la app.
3. **Retención:** Recordatorios "hace 30 días que no limpias tus contactos" (requiere email collection).
4. **Monetización:** Freemium con pago por volumen o por features avanzadas (IA premium, fine-tuning).

---

## 3.2 ASO Specialist

### App Store Optimization

**Estado:** No hay app en App Store ni Play Store.

### Recomendaciones
1. **PWA como MVP:** Implementar PWA → publicar en Google Play como TWA.
2. **Landing page SEO:** Optimizar `util.mejoraok.com` para keywords: "limpiar contactos", "deduplicar agenda", "unificar contactos".
3. **Keywords target:** "contact cleaner", "duplicate contacts remover", "contact organizer AI", "VCARD cleaner".

---

## 3.3 Performance Marketing Manager

### Canales Recomendados

| Canal | Costo estimado | ROI esperado | Prioridad |
|-------|---------------|-------------|-----------|
| Google Ads (search) | $0.10-0.50/click | Alto (intención alta) | ⭐⭐⭐⭐ |
| Reddit (r/productivity) | Gratis | Medio | ⭐⭐⭐ |
| Product Hunt | Gratis | Alto (launch) | ⭐⭐⭐⭐ |
| Twitter/X | Gratis | Medio | ⭐⭐ |
| YouTube tutorial | Gratis | Alto (SEO largo plazo) | ⭐⭐⭐⭐ |

### Recomendaciones
1. **Product Hunt launch:** Preparar screenshots, video demo, descripción compelling.
2. **YouTube tutorial:** "Cómo limpiar 1000 contactos en 5 minutos" — SEO evergreen.
3. **Reddit posts:** En r/productivity, r/organize, r/dataisbeautiful.
4. **Google Ads:** Keywords de alta intención: "clean up phone contacts", "remove duplicate contacts".

---

## 3.4 SEO Specialist

### SEO Actual

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Meta tags | ⭐⭐ | Básicos, sin Open Graph completo |
| Structured data | ❌ | Sin Schema.org markup |
| Sitemap | ❌ | Sin sitemap.xml |
| robots.txt | ✅ | Presente pero genérico |
| Page speed | ⭐⭐ | Sin CDN, ~3-5s load |
| Mobile-friendly | ⭐⭐⭐ | Responsive pero no optimizado |

### Recomendaciones
1. **Open Graph completo:** `og:title`, `og:description`, `og:image` para compartir en redes.
2. **Schema.org:** `SoftwareApplication` markup para que Google entienda que es una app.
3. **Sitemap:** Generar `sitemap.xml` con la página principal.
4. **Landing page dedicada:** Página de features, pricing, FAQ — no solo la app directamente.
5. **Blog:** Artículos sobre gestión de contactos → tráfico orgánico.

---

## 3.5 Business Development Manager

### Oportunidades de Partnership

| Partner | Tipo | Valor |
|---------|------|-------|
| Google (Contacts API) | Integration | Credibilidad + distribución |
| CRM providers | Integration | Acceso a mercado enterprise |
| Phone carriers | White-label | Distribución masiva |
| Data recovery services | Cross-sell | Usuarios con datos perdidos |

### Recomendaciones
1. **Google Workspace Marketplace:** Publicar como add-on de Google Contacts.
2. **API pública:** Exponer la limpieza como API para que otros developers la integren.
3. **White-label:** Licenciar la tecnología a operadoras telefónicas o fabricantes de teléfonos.

---

## 3.6 Account Manager

### Gestión de Usuarios (futuro)

Si se convierte en SaaS:
1. **Tier gratuito:** 500 contactos, 3 proveedores IA
2. **Tier Pro ($9/mes):** 10,000 contactos, 12 proveedores, fine-tuning
3. **Tier Enterprise:** Ilimitado, API, white-label, soporte dedicado

---

## 3.7 Content Manager

### Contenido Actual

| Tipo | Estado | Calidad |
|------|--------|---------|
| README | ✅ | ⭐⭐⭐⭐ Bueno |
| DOCS.md | ✅ | ⭐⭐⭐⭐⭐ Excelente |
| PROMPT.md | ✅ | ⭐⭐⭐⭐ Útil |
| Blog | ❌ | No existe |
| Videos | ❌ | No existen |
| Social media | ❌ | No existe |

### Recomendaciones
1. **Ciclo de contenido mensual:** 1 blog post + 1 video tutorial + 3 posts en redes.
2. **Topics sugeridos:**
   - "Cómo limpiar 10,000 contactos en minutos con IA"
   - "Los 5 errores más comunes en bases de contactos"
   - "Comparativa: limpieza manual vs IA vs reglas"
   - "De CSV caótico a agenda perfecta: caso de estudio"

---

## 3.8 Community Manager

### Comunidad Actual

No hay comunidad activa.

### Recomendaciones
1. **Discord/Telegram:** Crear canal de soporte y comunidad.
2. **GitHub Discussions:** Activar en el repo para preguntas y feedback.
3. **Changelog público:** Documentar cada versión para usuarios interesados.
4. **Beta testers:** Reclutar 10-20 beta testers para feedback temprano.

---

# 4. Área de Operaciones, Legal y Análisis

## 4.1 Business Intelligence Analyst

### KPIs Sugeridos

| KPI | Meta | Medición |
|-----|------|----------|
| Contactos procesados/mes | 100K | Analytics events |
| Tasa de completado del pipeline | >80% | Start → End tracking |
| Tiempo promedio de procesamiento | <5min para 1000 contacts | Backend timing |
| Proveedores IA más usados | Top 3 | API key usage |
| Formatos de importación más usados | Top 3 | File type tracking |
| Tasa de éxito de dedup | >15% duplicados encontrados | Métricas de pipeline |

### Recomendaciones
1. **Dashboard de BI:** Conectar analytics a Grafana o Metabase para visualización.
2. **Cohortes:** Agrupar usuarios por fecha de primer uso y medir retención.
3. **A/B testing:** Testear diferentes flows de onboarding para optimizar completado.

---

## 4.2 Data Scientist

### Oportunidades de Análisis

1. **Análisis de calidad de datos:** Con los datos anonimizados, analizar patrones de suciedad en contactos.
2. **Predicción de duplicados:** Modelo que prediga probabilidad de duplicado antes de procesar todo.
3. **Segmentación de usuarios:** Clustering de usuarios por comportamiento de uso.
4. **Optimización de prompts:** Análisis de respuestas de IA para mejorar prompts.

### Recomendaciones
1. **Telemetría anonimizada:** Recopilar métricas sin PII para análisis de patrones.
2. **Modelo de calidad:** Entrenar un modelo simple que prediga score de calidad de un contacto sin llamar a IA.

---

## 4.3 Legal & Compliance Officer

### Evaluación Legal

| Aspecto | Estado | Riesgo |
|---------|--------|--------|
| GDPR | ⚠️ Parcial | Datos de contactos son PII — procesamiento en browser ayuda |
| Terms of Service | ❌ No existen | Alto |
| Privacy Policy | ❌ No existen | Alto |
| Cookie consent | ❌ No implementado | Medio |
| Data retention | ⚠️ Indefinida (IndexedDB) | Medio |
| API provider ToS | ⚠️ No verificado | Medio |

### Recomendaciones
1. **Privacy Policy:** Documentar que los datos se procesan localmente, no se envían servidores propios.
2. **Terms of Service:** Definir responsabilidades, limitación de liability.
3. **Cookie consent:** Implementar banner si se agregan analytics.
4. **Data deletion:** Permitir al usuario borrar todos sus datos con un click.
5. **API ToS review:** Verificar que los 12 proveedores IA permiten este uso.

---

## 4.4 Data Protection Officer (DPO)

### Evaluación de Protección de Datos

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Data minimization | ⭐⭐⭐⭐ | Solo se procesan datos necesarios |
| Purpose limitation | ⭐⭐⭐⭐ | Solo para limpieza/dedup |
| Storage limitation | ⭐⭐ | Sin política de retención |
| Data portability | ⭐⭐⭐⭐⭐ | 6 formatos de exportación |
| Right to erasure | ⭐⭐⭐ | Borrar datos en IndexedDB, pero sin confirmación |
| Data breach response | ❌ | Sin plan de respuesta |
| DPA con proveedores | ❌ | No hay Data Processing Agreements |

### Recomendaciones
1. **DPA con Supabase:** Firmar Data Processing Agreement con Supabase.
2. **DPA con proveedores IA:** Verificar que Groq, OpenRouter, etc. tienen DPA disponibles.
3. **Retención automática:** Borrar contactos de IndexedDB después de X días de inactividad.
4. **Plan de breach:** Documentar pasos si se detecta acceso no autorizado a datos.

---

## 4.5 Customer Success Manager

### Estrategia de Éxito del Usuario

| Fase | Acción | Métrica |
|------|--------|---------|
| Onboarding | Wizard de primera vez | Tasa de completado |
| Adopción | Recordatorios de limpieza | Frecuencia de uso |
| Valor | "Tu agenda mejoró un X%" | Satisfacción |
| Retención | Nuevos features, mejoras | Churn rate |

### Recomendaciones
1. **Email de bienvenida:** Si se recolecta email, enviar guía de uso.
2. **In-app tips:** Tooltips contextuales que expliquen features.
3. **Feedback loop:** Botón de "¿Cómo fue tu experiencia?" post-exportación.
4. **Success metrics:** Mostrar al usuario cuántos contactos limpió, cuántos duplicados eliminó, cuánto tiempo ahorró.

---

## 4.6 Technical Support (Tier 1, 2 & 3)

### Soporte Actual

| Tier | Estado | Detalle |
|------|--------|---------|
| Tier 1 (FAQ) | ❌ | No hay FAQ ni help center |
| Tier 2 (troubleshooting) | ⚠️ | Issues en GitHub como soporte informal |
| Tier 3 (engineering) | ✅ | El desarrollador responde directamente |

### Recomendaciones
1. **FAQ in-app:** Preguntas frecuentes integradas en la app.
2. **GitHub Issues template:** Template para bug reports con: navegador, pasos para reproducir, capturas.
3. **Error codes:** Asignar códigos de error para issues comunes (ej: `E001` = API key inválida).
4. **Chatbot básico:** Para Tier 1, un chatbot que responda preguntas frecuentes.

---

## 4.7 Revenue Operations (RevOps)

### Modelo de Revenue (futuro)

| Stream | Descripción | Potencial |
|--------|------------|-----------|
| Freemium | Gratis hasta 1000 contactos, $5/mes después | ⭐⭐⭐ |
| API access | Vender acceso a la API de limpieza | ⭐⭐⭐⭐ |
| Enterprise | White-label + soporte + SLA | ⭐⭐⭐⭐⭐ |
| Marketplace | Publicar en Google Workspace, Microsoft AppSource | ⭐⭐⭐ |

### Recomendaciones
1. **Stripe integration:** Para procesar pagos si se implementa freemium.
2. **Usage tracking:** Medir uso para pricing basado en valor.
3. **Revenue forecasting:** Modelar escenarios de crecimiento con diferentes price points.

---

# 5. Plan por Etapas (Optimizado)

## Estado Actual: v5.0 ✅

El proyecto tiene un core sólido, deploy funcional, 150 tests, y documentación consolidada. Las etapas anteriores (v1-v5) están completas.

## Etapa 6 — Seguridad y Estabilidad (Prioridad: 🔴 Alta) ✅ COMPLETADA

**Completada:** 2026-04-24 (v6.0, commit `3018f84`)

| # | Tarea | Responsable | Esfuerzo | Impacto | Estado |
|---|-------|------------|----------|---------|--------|
| 6.1 | CSP headers en `.htaccess` | Cybersecurity | 30min | Alto | ✅ |
| 6.2 | Auth en Edge Function (verificar JWT) | Backend Dev | 2h | Alto | ✅ |
| 6.3 | npm audit en CI pipeline | DevOps | 15min | Medio | ✅ |
| 6.4 | React Error Boundaries | Frontend Dev | 1h | Alto | ✅ |
| 6.5 | Error tracking utility (preparado para Sentry) | SRE | 30min | Alto | ✅ |
| 6.6 | Privacy Policy + ToS (páginas estáticas) | Legal | 3h | Alto | ✅ |
| 6.7 | Validación de input en Edge Function | Backend Dev | 1h | Medio | ✅ |

**Entregable:** Deploy seguro + monitoreo básico + cumplimiento legal mínimo ✅

---

## Etapa 7 — UX y Onboarding (Prioridad: 🟡 Media-Alta)

| # | Tarea | Responsable | Esfuerzo | Impacto |
|---|-------|------------|----------|---------|
| 7.1 | Wizard de primera vez (3 pasos) | UX Designer + Frontend | 4h | Alto |
| 7.2 | Modo simple vs avanzado | UX Designer | 3h | Alto |
| 7.3 | Empty states con ilustraciones | UI Designer | 2h | Medio |
| 7.4 | Preview antes de procesar | Frontend Dev | 3h | Alto |
| 7.5 | Copy mejorada (UX Writing) | UX Writer | 2h | Medio |
| 7.6 | Skeleton loading | UI Designer | 1h | Bajo |
| 7.7 | Analytics básico (Umami/Plausible) | Growth | 1h | Alto |

**Esfuerzo total:** ~16 horas
**Entregable:** Experiencia de primera vez pulida + datos de uso

---

## Etapa 8 — Performance y Escalabilidad (Prioridad: 🟡 Media)

| # | Tarea | Responsable | Esfuerzo | Impacto |
|---|-------|------------|----------|---------|
| 8.1 | PWA (manifest + Service Worker) | Frontend Dev | 3h | Alto |
| 8.2 | Dividir useContactProcessing en 3 hooks | Frontend Dev | 2h | Medio |
| 8.3 | React Context/Zustand para estado global | Frontend Dev | 2h | Medio |
| 8.4 | Cloudflare como proxy/CDN | Cloud Architect | 1h | Alto |
| 8.5 | Rollback automático en deploy | DevOps | 2h | Alto |
| 8.6 | Staging environment | DevOps | 3h | Medio |
| 8.7 | Batch progress real (streaming) | Backend Dev | 4h | Medio |

**Esfuerzo total:** ~17 horas
**Entregable:** App offline-capable + deploy más seguro + mejor DX

---

## Etapa 9 — Calidad y Testing (Prioridad: 🟡 Media)

| # | Tarea | Responsable | Esfuerzo | Impacto |
|---|-------|------------|----------|---------|
| 9.1 | E2E tests con Playwright | QA | 6h | Alto |
| 9.2 | Coverage report con mínimo 70% | QA | 1h | Medio |
| 9.3 | Visual regression (Chromatic) | QA | 3h | Bajo |
| 9.4 | Performance budget test | QA | 1h | Medio |
| 9.5 | A11y automated tests | QA | 2h | Medio |
| 9.6 | Edge Function integration tests | Backend Dev | 3h | Alto |

**Esfuerzo total:** ~16 horas
**Entregable:** Suite de testing completa + confianza en cambios

---

## Etapa 10 — Crecimiento y Monetización (Prioridad: 🟢 Media-Baja)

| # | Tarea | Responsable | Esfuerzo | Impacto |
|---|-------|------------|----------|---------|
| 10.1 | Landing page con SEO | SEO + Content | 4h | Alto |
| 10.2 | Product Hunt launch | Growth | 2h | Alto |
| 10.3 | i18n (inglés + portugués) | Localization | 6h | Medio |
| 10.4 | Fine-tuning pipeline | ML Engineer | 8h | Medio |
| 10.5 | Supabase sync (backup multi-device) | Data Engineer | 6h | Alto |
| 10.6 | Stripe integration (freemium) | Backend Dev | 4h | Alto |
| 10.7 | Embeddings para dedup semántica | ML Engineer | 6h | Medio |

**Esfuerzo total:** ~36 horas
**Entregable:** Presencia en mercado + revenue potential + diferenciación técnica

---

## Cronograma Sugerido

```
Semana 1:  Etapa 6 (Seguridad) — bloqueante, hacer primero
Semana 2:  Etapa 7 (UX) — impacto directo en usuarios
Semana 3:  Etapa 8 (Performance) — mejorar infraestructura
Semana 4:  Etapa 9 (Testing) — asegurar calidad
Semana 5+: Etapa 10 (Crecimiento) — escalar
```

---

# 6. Documentación Consolidada

## Instrucción de Actualización

> **Cuando el usuario diga "documentar"**, actualizar este archivo (`Documents/ANALISIS_PROFUNDO.md`) con el estado actual del análisis, las etapas completadas, y cualquier cambio relevante. Todos los documentos viven en la carpeta `Documents/`.

## Archivos en `Documents/`

| Archivo | Descripción | Se actualiza con |
|---------|-------------|-----------------|
| `DOCS.md` | Documentación técnica consolidada | "documentar" |
| `PROMPT.md` | Prompt de continuidad para sesiones | Cambios significativos |
| `ANALISIS_PROFUNDO.md` | Este archivo — análisis multidisciplinario | "documentar" |

## Convención de Actualización

Cuando se diga **"documentar"**:
1. Leer todos los archivos en `Documents/`
2. Actualizar `DOCS.md` con: versión actual, commits recientes, estado de componentes, tests
3. Actualizar `ANALISIS_PROFUNDO.md` con: etapas completadas, nuevas recomendaciones, métricas
4. Actualizar `PROMPT.md` si hay cambios en el estado general
5. Hacer commit con mensaje `docs: documentación actualizada`

---

*Análisis generado el 2026-04-24 — Revisar periódicamente o al decir "documentar".*
