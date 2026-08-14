# motor-contactos — Tutorial rápido

Todo lo que se armó en esta sesión, para usar sin vueltas. Si algo no está
acá, `README.md` y `PENDIENTES.md` tienen el detalle completo.

## 1. Abrir la app

Doble clic en **`Iniciar App.bat`** (en la raíz de `motor-contactos/`).
Se abre una ventana propia — sin terminal, sin navegador — con la
identidad visual de Mejora Continua.

Si alguna vez hace falta reconstruirla después de tocar código (`ui/` o el
backend Python), correr `scripts\build_exe.ps1` y volver a abrir.

Alternativa más simple si algo del `.exe` da problemas: `Iniciar
Panel.bat` abre el panel clásico (más liviano, mismas funciones básicas,
sin la identidad visual nueva) en el navegador.

## 2. Qué hay en la app

Barra lateral izquierda, tres secciones:

- **Contactos** — tabla completa (8.541 contactos), buscador arriba por
  nombre/teléfono/email, click en cualquier fila para editar.
- **Revisión pendiente** — casos que ni las reglas ni la IA pudieron
  resolver solas, agrupados en lotes. "Aprobar" o "Rechazar" el lote
  entero de una. Hoy está en 0 — se cerraron todos los pendientes
  anteriores.
- **Sync a Google** — paso a paso de la Fase 4 (ver punto 5).

Botones abajo a la izquierda:

- **Correr pipeline** — extrae archivos nuevos de `Data/Crudos/`,
  normaliza, deduplica y reexporta la lista maestra. Usalo después de
  soltar un CSV/Excel nuevo en esa carpeta.
- **Exportar para WhatsApp** — genera `Data/Salida/contactos-whatsapp.csv`
  en el formato exacto que espera MejoraWS (ver punto 6).

## 3. Importar contactos nuevos

- **De Google** (Pablo y Sindy): ya está corriendo, se actualiza solo con
  el aviso mensual (punto 7). Para forzarlo a mano:
  ```
  PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli importar-google pablo
  PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli importar-google sindy
  ```
- **De un CSV/Excel de HubSpot, Mailchimp o Brevo**: exportá el archivo
  desde esa plataforma tal cual sale (sin tocarle las columnas) y soltalo
  en `Data/Crudos/`. Los encabezados típicos de las tres ("Phone Number",
  "Company Name", "Email Address", "FIRSTNAME", etc.) ya se reconocen
  solos — apretá "Correr pipeline" y listo.
- **Otros contactos de Gmail** (gente con la que hubo mail pero nunca se
  guardó como contacto): pide un login de Google APARTE (otro permiso,
  no el mismo de Fase 4):
  ```
  PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli importar-otros-contactos pablo
  ```
  Entran con confianza baja a propósito — nunca se fusionan solos contra
  un contacto ya verificado, siempre pasan por revisión primero.
- **PDF, capturas de pantalla, Word, texto libre de WhatsApp**: soltarlos
  en `Data/Crudos/` también — los extractores de Fase 2/3 ya los
  reconocen (necesitan Tesseract-OCR instalado aparte para capturas, ver
  `README.md`).

## 3.5. La tabla de contactos, a fondo

- **Todos los campos**: 12 columnas configurables (Cargo, Empresa,
  WhatsApp, Teléfono fijo, Email, Ciudad, Provincia, País, Domicilio,
  Cumpleaños, Tag, Nota) más Nombre fijo a la izquierda. Botón
  **"Columnas"** para tildar/destildar cuáles ver — se acuerda entre
  sesiones.
- **Angostar/ensanchar**: arrastrá el borde derecho de cualquier
  encabezado de columna. También se acuerda.
- **Filtro por columna**: el ícono de lupa en cada encabezado abre un
  filtro de "contiene" (texto) o, en Tag, una lista para tildar una o
  varias categorías a la vez.
- **Búsqueda global**: la caja de arriba busca en TODOS los campos a la
  vez, instantánea (no hace falta esperar, ya está todo cargado).
- **"Limpiar N filtros"**: aparece cuando hay algo filtrado, saca todo de
  una.

## 4. Editar un contacto a mano

Sección "Contactos" → buscar → click en la fila → se abre el editor:
nombre, apellido, cargo, empresa, WhatsApp, teléfono fijo, email, tag,
dirección, nota. Guardar. La corrección manual siempre pisa lo que
calculó la limpieza automática para ese contacto puntual — nunca se
pierde si se vuelve a correr el pipeline.

## 5. Activar el sync automático a Google (Fase 4) — lo único que es tuyo

Sección "Sync a Google" en la app tiene los 4 pasos con links directos.
Resumen: subís `lista-maestra.xlsx` a un Google Sheet, pegás
`google-apps-script/Sync.gs` en Apps Script de cada cuenta, corrés la
función una vez (ahí pide tu login de Google — es el único paso que
ninguna IA puede hacer por vos), y listo, queda sincronizando.
**Probalo primero con un Sheet de prueba y 2-3 contactos ficticios.**

## 6. Mandar WhatsApp con MejoraWS

Botón "Exportar para WhatsApp" → genera
`Data/Salida/contactos-whatsapp.csv`. Abrí MejoraWS
(`C:\Github\Herramientas\MejoraWS`, `Iniciar MejoraContacto.bat`) →
"Importar CSV/Excel" → elegí ese archivo. Ya viene en el formato exacto
que pide (nombre, teléfono sin "+", variable = tag del contacto).

## 7. Aviso mensual automático (día 30, 9:00)

Corre solo (tarea programada de Claude Code, no requiere que abras nada):
importa contactos nuevos de las dos cuentas de Google, normaliza,
deduplica, reexporta, y chequea anomalías (punto 8). Te llega como
notificación con el resumen. Requiere que la app de Claude Code esté
abierta ese día — si está cerrada, corre al abrir de nuevo.

## 8. Detección de anomalías ("se anticipa")

```
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli anomalias
```

Avisa si algún teléfono aparece en más de 5 contactos finales distintos —
señal típica de un número de oficina/conmutador guardado como si fuera de
una persona, o un error de carga. Hoy: ninguna anomalía en la base real.
Se corre solo como parte del aviso mensual también.

## 9. Aprendizaje (el otro "aprende")

Cada vez que aprobás/rechazás un lote en "Revisión pendiente", el sistema
ajusta el umbral de ese patrón específico para casos futuros parecidos
(`dedup/learning.py`) — no hace falta hacer nada aparte, ya está activo.

## 10. Dónde está todo

| Qué | Dónde |
|---|---|
| App de escritorio | `Iniciar App.bat` / `App/MotorContactos.exe` |
| Panel clásico (fallback) | `Iniciar Panel.bat` |
| Lista maestra | `Data/Salida/lista-maestra.xlsx` |
| CSV para WhatsApp | `Data/Salida/contactos-whatsapp.csv` |
| Soltar archivos nuevos acá | `Data/Crudos/` |
| Reconstruir el .exe | `scripts\build_exe.ps1` |
| Estado técnico completo | `PENDIENTES.md`, `DECISIONES.md` |
| Script de sync a Google | `google-apps-script/Sync.gs` |
| MejoraWS (WhatsApp) | `C:\Github\Herramientas\MejoraWS` |

## Si algo se rompe

`Iniciar Panel.bat` es el modo más simple y robusto (un solo proceso, sin
depender de nada más que el `.venv` ya armado) — si la app de escritorio
falla por lo que sea, ese siempre debería andar.
