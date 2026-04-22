# 📋 Plan de Trabajo — MejoraContactos v3

**Fecha:** 2026-04-22  
**Objetivo:** Llevar MejoraContactos a un nivel profesional con validación real, escalabilidad y mejoras de UX priorizadas por impacto.

---

## Fase 1 — Fixes críticos de deploy (⏱ ~1 hora)

| # | Tarea | Detalle | Prioridad |
|---|-------|---------|-----------|
| 1.1 | Configurar base path en Vite | `base: '/mejoracontactos/'` en `vite.config.ts` | 🔴 Crítica |
| 1.2 | Configurar basename en React Router | `<BrowserRouter basename="/mejoracontactos">` en `App.tsx` | 🔴 Crítica |
| 1.3 | Crear `.htaccess` para SPA | Rewrite rules para que todas las rutas sirvan `index.html` | 🔴 Crítica |
| 1.4 | Crear script `deploy.sh` | Build + upload por FTP automático | 🟡 Alta |

**Entregable:** App accesible en `util.mejoraok.com/mejoracontactos` sin 404.

---

## Fase 2 — Validación de teléfonos WhatsApp (⏱ ~3 horas)

| # | Tarea | Detalle | Prioridad |
|---|-------|---------|-----------|
| 2.1 | Implementar `validateWhatsApp()` | Usar `libphonenumber-js` para parseo E.164 real | 🔴 Crítica |
| 2.2 | Detectar tipo de línea | Móvil ✅ WhatsApp / Fijo ❌ solo voz / 0800 ❌ inválido | 🔴 Crítica |
| 2.3 | Soporte multi-país | Argentina (+54 9 móvil), España (+34 6xx), México (+52 1), etc. | 🟡 Alta |
| 2.4 | Badge visual por número | 🟢📱 WhatsApp válido / 🟡📞 Solo fijo / ❌ Inválido | 🟡 Alta |
| 2.5 | Formatos argentinos | `011-15-XXXX`, `15-XXXX`, `(011) 4XXX` → E.164 correcto | 🟡 Alta |

**Entregable:** Cada teléfono tiene validación E.164 con indicador de compatibilidad WhatsApp.

---

## Fase 3 — Validación semántica determinística (⏱ ~1 día)

| # | Tarea | Detalle | Prioridad |
|---|-------|---------|-----------|
| 3.1 | Módulo `field-validator.ts` | Estructura base con interfaces `FieldValidation`, `ContactValidationResult` | 🔴 Crítica |
| 3.2 | Validación de nombres | Regex + blacklist (junk, empresas, cargos) + Title Case + separación automática firstName/lastName | 🔴 Crítica |
| 3.3 | Validación de apellidos | Partículas compuestas (de la Cruz, O'Brien), no igual a firstName | 🟡 Alta |
| 3.4 | Validación de email | Regex RFC, blacklist dominios temporales, corrección de typos (`gmial.com` → `gmail.com`) | 🟡 Alta |
| 3.5 | Validación de empresa | No parece persona, detecta sufijos (S.A., LLC, Inc), capitalización correcta | 🟡 Alta |
| 3.6 | Validación de cargo | Lista de cargos válidos, normalización (`ceo` → `CEO`), rechazo de datos cruzados | 🟡 Alta |
| 3.7 | Score de calidad por contacto | 0-100 basado en validación de cada campo | 🟢 Media |

**Entregable:** Cada contacto tiene score de calidad y cada campo tiene estado de validación (✅⚠️❌).

---

## Fase 4 — Performance y escalabilidad (⏱ ~1 día)

| # | Tarea | Detalle | Prioridad |
|---|-------|---------|-----------|
| 4.1 | Hash index para dedup O(n) | Reemplazar Jaro-Winkler O(n²) por índices de email/phone/name | 🔴 Crítica |
| 4.2 | Cache de validaciones IA | `Map<field:value>` para no re-validar el mismo dato | 🟡 Alta |
| 4.3 | Batch size dinámico por proveedor | Groq: 30, Cloudflare: 10, HuggingFace: 5 | 🟡 Alta |
| 4.4 | Scroll dinámico en tabla | `calc(100vh - Xpx)` en vez de `h-[400px]` fijo | 🟡 Alta |
| 4.5 | Web Worker para pipeline | Mover limpieza a background thread, no bloquear UI | 🟢 Media |
| 4.6 | Chunking para archivos grandes | Procesamiento por lotes de 10K, progress bar, checkpoints | 🟢 Media |

**Entregable:** La app maneja 100K+ registros sin congelarse, dedup es instantáneo.

---

## Fase 5 — Multi-cuenta Google Contacts (⏱ ~1 día)

| # | Tarea | Detalle | Prioridad |
|---|-------|---------|-----------|
| 5.1 | Store de múltiples tokens OAuth | `GoogleAccount[]` en IndexedDB, máximo 5 cuentas | 🟡 Alta |
| 5.2 | UI de multi-cuenta | Grid 5 slots, avatar, email, sync individual/masivo, colores por cuenta | 🟡 Alta |
| 5.3 | Refresh automático de tokens | Detectar expiración y renovar sin intervención del usuario | 🟡 Alta |
| 5.4 | Tracking de origen por cuenta | `googleAccountId` + color en cada contacto importado | 🟢 Media |

**Entregable:** Hasta 5 cuentas de Google conectadas simultáneamente con sync independiente.

---

## Fase 6 — Exportación de logs e informes (⏱ ~1 día)

| # | Tarea | Detalle | Prioridad |
|---|-------|---------|-----------|
| 6.1 | Estructura `TrainingLogEntry` | Input original → output limpiado → corrección humana → metadata | 🟡 Alta |
| 6.2 | Export JSONL para fine-tuning | Formato compatible con OpenAI/HuggingFace/Axolotl | 🟡 Alta |
| 6.3 | Export CSV de logs | Para análisis en Excel/Google Sheets | 🟢 Media |
| 6.4 | Importar logs previos | Retomar aprendizaje de sesiones anteriores | 🟢 Media |
| 6.5 | Generador de informes HTML | Resumen ejecutivo, stats por campo, problemas detectados, recomendaciones | 🟢 Media |
| 6.6 | Informe imprimible como PDF | CSS `@media print` optimizado | 🟢 Media |

**Entregable:** Se pueden exportar logs de entrenamiento y generar informes de trabajo profesionales.

---

## Fase 7 — UX/UI (⏱ ~1 día)

| # | Tarea | Detalle | Prioridad |
|---|-------|---------|-----------|
| 7.1 | Tabs responsive en mobile | Scroll horizontal o iconos solos en < 375px | 🟡 Alta |
| 7.2 | Indicadores de validación en tabla | Columna de score + iconos por campo (✅⚠️❌) | 🟡 Alta |
| 7.3 | Panel de validación al editar contacto | Estado en tiempo real por campo, sugerencias de corrección | 🟢 Media |
| 7.4 | Dashboard enriquecido | Gráfico de calidad por campo, top empresas/cargos, comparativa proveedores | 🟢 Media |
| 7.5 | Modo oscuro | Toggle dark/light, `next-themes` | 🟢 Media |
| 7.6 | Accesibilidad | `aria-label`, contraste de colores, focus visible, keyboard nav | 🟢 Media |

**Entregable:** Interfaz responsiva, accesible, con feedback visual de calidad de datos.

---

## Fase 8 — Validación semántica con IA (✅ COMPLETADO)

| # | Tarea | Detalle | Estado |
|---|-------|---------|--------|
| 8.1 | Prompt de validación optimizado | JSON compacto, mínimo de tokens, un request por contacto | ✅ |
| 8.2 | Integración con pipeline existente | La IA valida solo los campos que las reglas determinísticas no pudieron resolver | ✅ |
| 8.3 | Cache de validaciones IA | Evita re-validar el mismo dato dos veces | ✅ |

**Entregable:** Los casos ambiguos que las reglas no resuelven se validan con IA automáticamente. Pipeline visual actualizado.

---

## Resumen de tiempos estimados

| Fase | Duración estimada | Estado | Commit |
|------|----------|--------|--------|
| Fase 1 — Deploy | ~1 hora | ✅ Completado | 95ab556 |
| Fase 2 — Teléfonos | ~3 horas | ✅ Completado | 95ab556 |
| Fase 3 — Validación determinística | ~1 día | ✅ Completado | 95ab556 |
| Fase 4 — Performance | ~1 día | ✅ Completado | 95ab556 |
| Fase 5 — Google multi-cuenta | ~1 día | ✅ Completado | 273c3a3 |
| Fase 6 — Logs e informes | ~1 día | ✅ Completado | 273c3a3 |
| Fase 7 — UX/UI | ~1 día | ✅ Completado | 273c3a3 |
| Fase 8 — Validación IA | ~1 día | ✅ Completado | b5f1579 |
| **Total** | **~6-7 días** | **8/8 completadas** | **3 commits** |

---

## Qué NO incluir (por ahora)

| Feature | Razón |
|---------|-------|
| Escalabilidad a 1M+ registros | IndexedDB degrada antes; apuntar a 200K como límite práctico |
| Sistema de aprendizaje local | Dataset de correcciones será insuficiente; mejor enfocarse en export JSONL |
| Colaboración en tiempo real | Complejidad enorme para uso individual; posponer |
| API REST local (Service Worker) | Overengineering; el export CSV/JSON es suficiente |
| Integración con LinkedIn | Riesgo legal por litigios de scraping |
| 100K+ archivos individuales | El problema real es cantidad de registros, no cantidad de archivos |

---

## Nota de seguridad

**⚠️ Las credenciales (GitHub token, FTP password, Supabase key) NO deben estar en este documento ni en ningún archivo del repo.** Usar variables de entorno o un gestor de secrets. Rotar todas las credenciales expuestas en los prompts originales.

---

*Plan generado el 2026-04-22 basado en análisis del repositorio pabloeckert/MejoraContactos*
