# motor-contactos — Trabajo realizado

Reporte de entrega. Última actualización: 2026-08-14.

## 1. Qué es

Sistema privado (Python + React, corre 100% local) que unifica, limpia y
deduplica los contactos reales de Pablo y Sindy — hoy desparramados entre
dos cuentas de Google con 15+ años de carga desprolija — en una única
lista maestra confiable, sincronizable de vuelta a Google Contacts.

## 2. Estado real de los datos (verificado en base, no estimado)

| Métrica | Valor |
|---|---|
| Contactos crudos importados (Pablo + Sindy) | 36.103 |
| Registros normalizados | 36.102 |
| **Contactos finales, deduplicados** | **8.541** |
| Casos pendientes de revisión manual | **0** |
| Contactos con cumpleaños | 951 |
| Contactos con foto | 5.012 |

Es decir: de 36.103 entradas crudas (muchas duplicadas, mal escritas, con
teléfonos/nombres/emails mezclados en el campo equivocado), el sistema
llegó solo a 8.541 personas reales distintas — sin que quede un solo caso
sin resolver.

## 3. Arquitectura del pipeline

1. **Fuente**: conexión directa a Google Contacts (People API) de ambas
   cuentas — ya no depende de exportar CSV a mano.
2. **Limpieza**: nombre, apellido, cargo y empresa se separan y corrigen
   con reglas calibradas contra los datos reales (teléfonos guardados
   como nombre, honoríficos, cargos concatenados, caracteres sueltos como
   `*` o `:::`, filas plantilla de Google/Mailchimp, contactos técnicos
   de apps como "Contacts+").
3. **Deduplicación en 3 bandas de confianza**:
   - Coincidencia exacta de teléfono/email → fusiona sola.
   - Sin ninguna señal en común → separa sola.
   - Banda dudosa → decide una IA (Groq y modelos gratis de OpenRouter
     primero, Anthropic pago solo si hace falta, para minimizar costo) y,
     si tampoco resuelve con confianza, va a revisión humana en lote.
   - Salvaguarda propia: un teléfono compartido por dos personas con
     nombres claramente distintos (línea familiar u oficina) nunca se
     fusiona en silencio.
4. **Aprendizaje**: cada decisión humana ajusta el umbral de ese patrón
   específico para casos futuros parecidos.
5. **Detección de anomalías**: alerta si un teléfono aparece en más de 5
   contactos finales distintos (señal de conmutador/error de carga). Hoy:
   0 anomalías.
6. **Nada se pierde ni se fusiona de forma irreversible**: cada corrida
   queda auditada, y se puede deshacer una fusión puntual o toda una
   corrida completa de una sola vez.

## 4. Interfaces

- **App de escritorio** (`Iniciar App.bat` / `App/MotorContactos.exe`):
  ventana nativa, sin terminal, con la identidad visual de Mejora
  Continua (tipografía, paleta y logo del manual de marca). Tabla
  completa con 12 columnas configurables, redimensionables y con filtro
  combinado por columna + búsqueda global instantánea; cola de revisión
  en lote; edición de cualquier campo por contacto; sección de sync a
  Google.
- **Panel clásico** (`Iniciar Panel.bat`): mismo motor, versión más
  simple en el navegador, como respaldo si la app de escritorio fallara.

## 4.1 Desarrollo visual y UX/UI — detalle

### Estructura de pantalla

- **Sidebar fija a la izquierda** (240px, fondo blanco, borde derecho
  fino): arriba el isotipo de marca (32px) + wordmark "motor-contactos"
  en Bw Modelica; debajo, navegación de 3 ítems (Contactos / Revisión
  pendiente / Sync a Google) — el activo se marca con fondo azul claro y
  texto azul, el resto en gris con hover sutil; "Revisión pendiente"
  lleva una píldora amarilla con el conteo cuando hay algo pendiente.
  Abajo de todo, dos acciones fijas: "Correr pipeline" (botón azul
  sólido, primario) y "Exportar para WhatsApp" (botón con borde,
  secundario), con una línea de estado debajo tras cada acción.
- **Panel principal**: arriba, 4 tarjetas de métricas en fila (Contactos
  / Registros normalizados / Registros crudos / Pendientes), cada una
  con ícono en cuadrado de color, número grande y etiqueta chica en
  mayúsculas. Debajo, el contenido cambia según la sección elegida.

### Vista "Contactos"

- Barra de herramientas: buscador con ícono de lupa (placeholder
  "Buscar en todos los campos..."), botón "Columnas" (abre un panel con
  checkbox por campo), "Limpiar N filtros" en rojo (solo aparece si hay
  algo filtrado), y a la derecha el contador "X de Y contactos".
- Tabla: encabezado fijo arriba (fondo gris clarito, etiquetas en
  mayúscula chica); columna Nombre fija a la izquierda con avatar
  circular de iniciales (color asignado por hash del contacto, así cada
  persona siempre tiene el mismo color) + nombre completo; 12 columnas a
  la derecha, cada una con: label, ícono de filtro (lupa chica, se pone
  azul si tiene un filtro activo), y una manija invisible en el borde
  derecho para arrastrar y redimensionar. La columna Tag muestra el
  valor como píldora gris en vez de texto plano.
- Filas virtualizadas (solo se renderizan las visibles en pantalla, aunque
  haya 8.541 — por eso el scroll es fluido incluso con toda la base
  cargada), hover gris clarito, click abre el editor.
- Dos estados vacíos distintos: "todavía no hay contactos" (primera vez)
  vs. "sin resultados para estos filtros" (con botón "Limpiar filtros")
  — mensajes distintos a propósito, porque la causa y la solución no son
  la misma.

### Vista "Revisión pendiente"

Tarjetas agrupadas por patrón de coincidencia; cada par pendiente muestra
lado a lado nombre, organización, teléfono, email, de qué fuente salió
cada contacto y su foto si tiene — para decidir con contexto real, no un
id numérico pelado. Botones "Aprobar"/"Rechazar" el lote completo.

### Vista "Sync a Google"

Lista numerada de 4 pasos con círculos azules numerados, links directos a
Google Sheets y Apps Script embebidos en el texto, y una caja de aviso
amarilla al final ("probá primero con un Sheet de prueba...").

### Editor de contacto (modal)

Overlay oscuro + tarjeta centrada: grilla de 2 columnas para campos
cortos (nombre, apellido, cargo, empresa, tag, dirección), 3 columnas de
textareas para los campos que pueden tener más de un valor (WhatsApp,
teléfono fijo, email — uno por línea), textarea aparte para la nota.
Botones "Cancelar"/"Guardar" abajo a la derecha.

### Sistema de diseño aplicado

- **Color**: Azul `#1A3D84` como primario (estructura, botones,
  estados activos, avatares), Rojo `#E1061E` reservado para
  error/limpiar, Amarillo `#F7CC13` para lo que necesita atención
  (píldora de pendientes, tag, avisos) — blanco dominante en todo el
  fondo, el color se usa como acento puntual, nunca como bloque grande
  (regla del manual de marca).
- **Tipografía**: Bw Modelica para el wordmark, League Spartan para el
  resto — ambas embebidas como archivos locales (no dependen de
  internet ni de que la fuente esté instalada en la PC).
- **Logo**: isotipo como ícono de la ventana/pestaña y en el sidebar.

### Interacciones construidas (más allá de mostrar datos)

Filtro de texto "contiene" por columna, multiselect de categorías en Tag,
búsqueda global instantánea con normalización de acentos (busco
"posadas" y encuentra "Pósadas"), columnas mostrar/ocultar y
redimensionables con la elección guardada entre sesiones (localStorage),
encabezado y primera columna fijos al hacer scroll horizontal/vertical.

### Honestidad sobre lo que falta pulir (autocrítica, no solo lo que pediste)

- Los popovers de filtro en columnas muy a la derecha (Tag, Nota) pueden
  abrirse fuera del viewport visible si la tabla está muy ancha — hay que
  hacer scroll horizontal primero para verlos bien.
- Los colores de los avatares son una paleta genérica (azul/verde/violeta/
  ámbar/rosa/cian de Tailwind), no derivada de la paleta de marca.
- Sin modo oscuro.
- Sin paso de accesibilidad (navegación por teclado, lectores de
  pantalla) todavía.
- Sin transiciones/animaciones — los cambios de vista y los filtros son
  instantáneos pero "secos", sin microinteracción.
- Muchos contactos muestran "(sin nombre)" de forma prominente en la
  columna principal — funciona, pero visualmente es ruidoso cuando hay
  muchos seguidos (ver captura que mandaste).

## 5. Automatización

- **Aviso mensual autónomo** (día 30, 9:00): importa contactos nuevos de
  las dos cuentas de Google, normaliza, deduplica, reexporta y chequea
  anomalías — sin que nadie tenga que abrir nada.
- **Backup**: cada corrida grande queda respaldada en un repo git local
  (sin conexión a internet, solo historial en esta PC).

## 6. Integraciones construidas

| Integración | Estado |
|---|---|
| Google Contacts (import) | ✅ En vivo, funcionando |
| Sync de vuelta a Google Contacts (Apps Script) | ✅ Código listo — falta tu login una vez |
| "Otros contactos" (gente con la que hubo mail, nunca guardada) | ✅ Código listo — falta un login aparte (otro permiso) |
| HubSpot / Mailchimp / Brevo (CSV) | ✅ Reconocimiento automático de sus encabezados |
| MejoraWS (envío de WhatsApp) | ✅ Export en el formato exacto que necesita |
| PDF / capturas / Word / texto libre | ✅ Construido (capturas necesitan Tesseract-OCR instalado aparte) |

## 7. Calidad y verificación

- **195 tests automáticos**, todos en verde — cubren normalización,
  deduplicación, exportación, API y la interfaz.
- Cada feature de esta lista se probó contra la base real (no solo con
  datos de prueba) antes de darla por terminada.
- 6 bugs reales encontrados y corregidos en el camino (no hipotéticos —
  cada uno se detectó ejecutando el sistema real, no leyendo el código):
  límite oculto de 500 filas en la tabla, dos problemas de concurrencia
  (`sqlite3` entre hilos), resolución de configuración en el ejecutable
  empaquetado, un ítem de la encuesta original (Cumpleaños/Foto) que
  nunca se había capturado, y la cola de revisión sin info suficiente
  para decidir.

## 8. Lo único pendiente de vos

No hay nada más bloqueado técnicamente. Estos dos pasos necesitan tu
login real de Google — ningún sistema puede hacerlos por vos:

1. **Sync a Google Contacts**: 4 pasos con links directos en la sección
   "Sync a Google" de la app. Recomendado probar primero con un Sheet de
   prueba y 2-3 contactos ficticios.
2. **"Otros contactos" de Gmail** (opcional): un comando aparte,
   `importar-otros-contactos`, pide otro login con otro permiso.

## 9. Documentación completa

- `TUTORIAL.md` — paso a paso de uso.
- `PENDIENTES.md` / `DECISIONES.md` — historial técnico completo,
  sesión por sesión, con el motivo de cada decisión.
- `ESPECIFICACION.md` — arquitectura de referencia.
