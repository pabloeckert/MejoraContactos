# Decisiones y hallazgos — log append-only

No editar entradas viejas. Cada sesión/cuenta agrega una entrada nueva al
final con fecha, con el formato: qué se decidió/encontró, por qué, y qué
impacto tiene. `scripts/handoff.ps1` incluye las entradas más recientes en
su reporte automáticamente (busca las últimas bajo el separador `---`).

---

## 2026-08-11 — Estado heredado de sesiones anteriores (semilla de este log)

- Motor construido hasta Fase 4 (extracción multi-formato, normalización,
  dedup 3 bandas + LLM-judge, panel HTML, export, sync a Google). 163 tests
  en verde antes del corte de esta sesión.
- Se migró `Sync.gs` de `ContactsApp` (dado de baja por Google 31/01/2025)
  a la People API — sin probar en vivo todavía.
- Se construyó una API JSON (`src/motor/api.py`) y una UI nueva
  (`motor-contactos/ui/`, Vite+React+TS+Tailwind, sin marca) como primer
  corte de la Fase 1 del plan "v2" — funciona end-to-end contra el backend
  real (confirmado con curl y `read_network_requests`), pendiente de
  confirmación visual del usuario en su propio navegador.
- Se corrigió un bug real: `_calcular_stats`/`_agrupar_pendientes` en
  `reviewer_app.py` contaban `decisiones_log` histórico completo en vez de
  filtrar por la corrida más reciente, inflando el contador de pendientes
  (1090 en vez del valor real). Fix: filtrar por `MAX(corrida_id)`.
- **Incidente crítico**: `Data/Crudos/` y `Data/Salida/staging.sqlite`
  (91MB, 34.810 registros normalizados reales) se borraron del disco por
  una causa externa a cualquier comando ejecutado por Claude en esa sesión.
  Se encontraron intactos en la Papelera de Reciclaje de Windows
  (tamaños coincidentes exactos), pero el intento de restauración
  automática falló (conflicto con archivos vacíos recreados por SQLite al
  reconectar) y quedó bloqueado por el clasificador de seguridad de Claude
  Code al intentar mover/renombrar la carpeta de datos real. Se le reportó
  la situación al usuario pidiéndole decidir el siguiente paso.
- **Estado al momento de escribir este log**: la Papelera de Reciclaje ya
  NO tiene esos archivos (se vació o se restauraron y volvieron a
  borrarse — sin confirmar cuál) y `Data/` no existe en absoluto en el
  disco. `vssadmin` (Volume Shadow Copy) requiere privilegios de
  administrador que esta sesión no tiene. **No confirmado si el usuario
  tiene otra copia de los CSV originales (exports de Google Contacts,
  potencialmente re-exportables si todavía tiene acceso a esas cuentas de
  Gmail).**
- El usuario pidió resetear el foco a un único objetivo (el MVP del motor
  de dedup autónomo, sin la tangente de "producto vendible"/investigación
  de estado del arte que se había abierto) y armar infraestructura de
  continuidad entre sus 7 cuentas de Claude (por límite de cuota): esta
  misma especificación, este log, `PENDIENTES.md`, y los scripts
  `setup_project.ps1`/`handoff.ps1`.
- Se decidió versionar `motor-contactos/` y `Data/` con repos git locales
  SIN remoto (nunca a GitHub) como red de seguridad contra un borrado
  accidental futuro — ver ESPECIFICACION.md § Versionado.

---

## 2026-08-11 (cont.) — Pivote: Google Contacts en vivo en vez de CSV manuales

- El usuario confirmó explícitamente que vació la Papelera de Reciclaje A
  PROPÓSITO ("SI YO FUI A DREDE"). Puede regenerar `pablo.csv`/`Sindy.csv`
  pero NO quiere hacerlo — pidió que el sistema se conecte directo a
  Google Contacts en vez de depender de exports manuales, porque tener
  `Data/` con archivos sueltos "confundía más" que ayudaba.
- Se construyó `src/motor/google_contacts_source.py`: usa la People API de
  Google (misma API que ya usa la Fase 4/`Sync.gs`, pero acá desde Python
  con `google-auth`/`google-auth-oauthlib`/`google-api-python-client` en
  vez de Apps Script) con OAuth de tipo "Aplicación de escritorio". Cada
  cuenta (`pablo`, `sindy`, en `config.yaml` → `google.cuentas`) se
  autoriza una vez vía `motor importar-google <cuenta>` (abre el
  navegador, pide login — es lo único de esto que Claude no puede hacer
  solo) y genera un `token_<cuenta>.json` local que se refresca sin volver
  a pedir login. Requiere un `credentials.json` (client OAuth, se genera
  en Google Cloud Console) — pasos completos en `GOOGLE_SETUP.md`.
- Se reusó la tabla `fuentes_procesadas` (la misma que ya usaba `ingest.py`
  para archivos) para el incremental de Google: ruta sintética
  `google:<cuenta>:<resourceName>` + el `etag` de Google como "hash" — así
  correr `importar-google` de nuevo solo trae contactos nuevos/modificados,
  sin reimportar todo ni duplicar `raw_records`.
- `_persona_a_campos()` traduce el `Person` de la People API a las mismas
  claves canónicas que ya produce `csv_extractor.py`/`column_mapping.py`
  (nombre, apellido, organizacion, cargo, telefono_N(+etiqueta), email_N,
  domicilio/ciudad/provincia/pais, notas) — el resto del pipeline
  (`normalize_pipeline.py`, dedup, etc.) no necesitó ningún cambio, no
  distingue de dónde vino el dato. Los `type` de teléfono de Google
  (mobile/home/work) coinciden literalmente con las pistas que
  `phone_normalizer.py` ya reconocía (`_PISTAS_MOVIL`/`_PISTAS_FIJO`) — cero
  fricción ahí.
- Los extractores de archivo (`extractors/`) NO se borraron — siguen
  disponibles para el día que haga falta importar algo que no vive en
  Google Contacts (PDF, capturas de pantalla, texto libre de WhatsApp).
  `Data/Crudos/` pasa a ser secundaria, no obligatoria.
- Se agregaron 6 tests nuevos (`test_google_contacts_source.py`) con
  `unittest.mock` (sin llamar nunca a la API real ni pedir login):
  mapeo de campos, inserción de `raw_records`, no-duplicación por mismo
  `etag`, reimportación si el `etag` cambió, paginación. Suite completa:
  **169 tests en verde**.
- Nuevo bloqueante crítico (reemplaza al anterior): el usuario todavía
  tiene que hacer el setup de Google Cloud Console (`GOOGLE_SETUP.md`
  Paso 1) y autorizar cada cuenta (Paso 2) — ninguno de los dos lo puede
  hacer Claude.

---
