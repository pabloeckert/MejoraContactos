

## ContactUnifier AI Pro — Nueva versión React

### Visión
App profesional para unificar contactos desde múltiples fuentes (CSV, Excel, VCF, JSON) con IA integrada para mapeo inteligente de columnas, limpieza de datos y deduplicación fuzzy. Tema dark con acento naranja (inspirado en v20).

### Arquitectura
- **Frontend**: React + TypeScript + Tailwind + shadcn/ui
- **IA**: Lovable AI Gateway (a través de edge function) para mapeo de columnas y limpieza de nombres — sin necesidad de que el usuario configure API keys
- **Almacenamiento**: IndexedDB (via idb) para contactos sin límite + localStorage para preferencias
- **Procesamiento**: Web Workers para dedup fuzzy Jaro-Winkler sin bloquear UI

### Páginas y flujo (tabs)

1. **📁 Importar** — Drag & drop de archivos/carpetas, preview de datos crudos, lista de archivos cargados con tamaño y tipo
2. **⚡ Procesar** — Botones Start/Pause/Stop, barra de progreso animada, log en tiempo real, estadísticas en vivo (filas/seg, únicos, descartados), mapeo de columnas detectado (editable)
3. **📋 Resultados** — Tabla virtual (react-virtual) para miles de contactos sin lag, búsqueda, filtros por país/confianza/tiene teléfono/email, edición inline con modal, indicadores de confianza por color
4. **📤 Exportar** — CSV (Google Contacts compatible), Excel (2 hojas: limpios + descartados), VCF/vCard, JSON. Estadísticas de exportación
5. **📊 Dashboard** — Distribución por país (barras), contactos por fuente, score promedio, estado del sistema

### Mejoras clave vs v16/v20

| Área | Mejora |
|------|--------|
| **IA** | Lovable AI integrada — 0 configuración de API keys, mapeo y limpieza de nombres automáticos |
| **Rendimiento** | Tabla virtualizada, Web Worker para dedup, IndexedDB sin límite de 5000 contactos |
| **UX** | Componentes shadcn, animaciones suaves, responsive, toasts para feedback, tema dark profesional |
| **Dedup** | Jaro-Winkler mejorado con normalización de acentos y comparación de teléfonos/emails |
| **Parseo** | PapaParse + SheetJS + parser VCF robusto con soporte de campos extendidos |
| **Teléfonos** | Validación con libphonenumber-js, país configurable, formato E.164 para WhatsApp |
| **Backup** | Export/import completo del estado (contactos + config + datos aprendidos) |

### Componentes principales
- `FileDropzone` — drag & drop con preview
- `ProcessingPanel` — controles, log, stats
- `ContactsTable` — tabla virtual con filtros y edición
- `ExportPanel` — botones de exportación con stats
- `DashboardPanel` — gráficos y estado
- `ColumnMapper` — editor visual de mapeo de columnas
- Edge function `process-contacts` — mapeo de columnas y limpieza con Lovable AI

### Diseño
- Tema dark: fondo `#080b14`, cards `#111827`, bordes `#1e2a40`
- Acento naranja `#f97316` para acciones principales
- Verde/rojo/amarillo para estados de confianza
- Header sticky con contador de contactos y estado online

