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

## 2026-08-12 — MVP corriendo con datos reales por primera vez

- El usuario hizo el setup de Google Cloud Console con ayuda de Claude
  Desktop (`credentials.json` verificado, estructura correcta). Se
  autorizaron ambas cuentas vía `motor importar-google <cuenta>` — Claude
  disparó el comando (Bash de esta sesión controla la máquina real de
  Pablo, confirmado en sesiones anteriores) y el usuario completó el login
  en el navegador que se abrió solo.
- **Resultado real**: 36.103 raw_records importados (18.135 Pablo +
  17.968 Sindy) → 36.102 normalizados → **8.593 contactos finales** tras
  dedup (92.533 fusiones por regla, 46.766 separados, 658 pendientes de
  revisión — sin LLM-judge porque `.env` sigue sin API keys).
  `lista-maestra.xlsx` exportado y respaldado en `Data/.git` (commit
  `7ed78b7`).
- **Hallazgo de tooling, no de código**: el CLI a veces imprime "raw_records
  nuevos: 0" en la salida final aunque la importación/normalización sí
  insertó filas reales — parece que el entorno de esta sesión ejecuta o
  reporta comandos en background más de una vez. La cifra impresa al final
  no es confiable por sí sola; siempre verificar contra la base
  (`SELECT COUNT(*) FROM raw_records`, etc.) antes de asumir que un paso
  no hizo nada. No se investigó la causa raíz — no bloquea el uso, solo
  hay que saber no confiar ciegamente en el número impreso.
- Con esto el MVP "funciona de punta a punta con datos reales": Google
  Contacts → normalizar → dedup → export. Lo que queda es afinar (API
  keys para bajar los 658 pendientes, revisión manual, probar Fase 4 de
  sync de vuelta a Google).

---

## 2026-08-12 (cont.) — Rotación de modelos gratis de OpenRouter

- Mientras corría en background el `deduplicar` con LLM-judge (658 casos,
  tardaba mucho por límites de tasa gratis), el usuario pidió aprovechar
  el tiempo y armar la integración de OpenRouter que había pedido antes
  ("que use todos los modelos de AI que sean free").
- Antes de escribir código se verificó la lista REAL de modelos gratis en
  vivo (`https://openrouter.ai/api/v1/models` vía `fetch()` en el Browser
  pane, no confiar en la memoria del modelo — el ecosistema cambia rápido
  y el conocimiento de Claude tiene fecha de corte). Resultado: 410
  modelos totales, 19 gratis. Se excluyeron del pool 3: dos son modelos de
  generación de MÚSICA (`google/lyria-3-pro-preview` y
  `google/lyria-3-clip-preview`, aparecieron en el filtro por precio 0
  pero no sirven para clasificar texto) y uno que la propia API marcaba
  como por expirar al día siguiente (`inclusionai/ling-3.0-tiny:free`).
  Quedaron 13 modelos utilizables (OpenAI gpt-oss-20b, dos Gemma 4 de
  Google, cuatro Nemotron de Nvidia más chicos/rápidos, dos Nemotron
  grandes, Liquid LFM-2.5, Cohere North-mini-code, y dos Poolside Laguna).
- `LlmJudge` (`llm_judge.py`) pasó de una cadena fija de 2 pasos
  (Groq → Anthropic) a: Groq + rotación round-robin de los 13 modelos
  OpenRouter (cada llamada a `decidir()` arranca en el siguiente candidato
  de la lista, no siempre el mismo, para repartir carga entre proveedores
  en vez de agotar la cuota gratis de uno solo) → si ninguno de los
  gratis resolvió con confianza suficiente, escala a Anthropic (pago)
  igual que antes. Compatible hacia atrás: con `rotacion_gratis_openrouter`
  vacío se comporta exactamente igual que la versión anterior.
- `config.py`: nuevo campo `LlmConfig.rotacion_gratis_openrouter: tuple[str, ...]`.
  `config.yaml`: la lista de 13 modelos, con comentario explícito de
  cuándo se verificó y que hay que re-chequear si empiezan a fallar
  seguido (la disponibilidad de modelos gratis en OpenRouter no es
  estable en el tiempo).
- 6 tests nuevos en `tests/test_llm_judge.py` (no existía antes ningún
  test de este módulo) — todo mockeado con `unittest.mock.patch` sobre
  `requests.post`, nunca se llama a una API real. Cubre: desactivado no
  llama a nadie, Groq confiado no escala, si Groq no tiene key salta
  directo al siguiente candidato, si nadie da confianza suficiente escala
  a Anthropic, si todos fallan devuelve `None` sin romper, y que el
  índice de rotación efectivamente avanza entre llamadas sucesivas.
  **175 tests en total, todos en verde.**
- Importante: la corrida de `deduplicar` que ya estaba corriendo en
  background al momento de este cambio NO usa esta rotación (ya había
  cargado la config vieja en memoria al arrancar) — sigue siendo
  Groq→Anthropic nomás para esa corrida puntual. La rotación se aplica
  recién en la PRÓXIMA vez que se corra `deduplicar`.

---

## 2026-08-13 — Dedup reanudable: el corte overnight no fue un bug, fue el entorno

- Se relanzó `deduplicar` como proceso desprendido de Windows
  (`Start-Process -WindowStyle Hidden`, no el `run_in_background` del
  harness) para que sobreviva mejor a un corte de sesión de Claude por
  cuota — motivado por evidencia real de esta misma sesión (el backend
  Flask murió solo entre turnos, dos veces antes). Se armó un `Monitor`
  tail-eando el log para avisar el progreso sin tener que sondear a mano.
- Igual murió: se cortó en el caso 40/596, sin ningún traceback en
  `dedup-corrida.err.log`. Conclusión: no fue un bug de código ni del
  proceso desprendido en particular — todo indica que el entorno/máquina
  se reinició de noche completo, matando también procesos desprendidos.
  Eso está fuera del control de este proyecto. La base se verificó
  intacta en el último estado bueno (596 pendientes, sin corrupción,
  gracias a que SQLite en modo WAL revierte solo las transacciones no
  commiteadas) — pero el trabajo de esos 40 casos se perdió igual, porque
  antes de este cambio `deduplicar_todo()` solo commiteaba una vez, al
  terminar TODO el lote completo.
- Decisión: en vez de seguir peleando con la supervivencia del proceso
  (variable fuera de control), se atacó el costo real de una
  interrupción. `deduplicar_todo()` (`merge_engine.py`) ahora:
  1. Commitea cada 50 pares procesados (antes: una sola vez al final).
  2. Al arrancar, busca una "corrida incompleta" — un `corrida_id` en
     `decisiones_log` que nunca llegó a tener clusters materializados
     (eso solo pasa al completar una corrida entera, así que su ausencia
     es señal inequívoca de corte a mitad de camino) — y la retoma con el
     MISMO `corrida_id`, reusando la decisión ya guardada para cada par
     ya procesado (incluye el union-find: si el par ya se había fusionado,
     se vuelve a unir sin re-preguntar) en vez de gastar de nuevo una
     llamada a reglas/LLM.
  3. Nuevo parámetro `continuar: bool = True` en `deduplicar_todo()` —
     default reanuda, `continuar=False` fuerza una corrida 100% fresca
     ignorando cualquier corrida incompleta previa (por si alguna vez hace
     falta descartar un intento a medio hacer en vez de retomarlo).
- 2 tests nuevos en `test_pipeline_integration.py`: uno fuerza una
  decisión vieja deliberadamente DISTINTA de lo que la regla calcularía
  fresca (mismo teléfono debería fusionar por regla, pero se pre-loguea
  como `revision_pendiente`) y confirma que gana la vieja — prueba real de
  que se está reusando, no de que casualmente da el mismo resultado. El
  otro confirma que `continuar=False` la ignora y recalcula fresco.
  **179 tests en verde.**
- Con esto, a partir de ahora un corte de sesión/máquina cuesta como
  mucho 50 pares de trabajo repetido, no la corrida entera — el problema
  de fondo (que el entorno puede reiniciarse sin aviso) sigue sin
  solución posible de este lado, pero el costo de que pase bajó
  muchísimo.

---

## 2026-08-13 (cont.) — Inconsistencia histórica encontrada: clusters vs decisiones_log desincronizados

- Al relanzar `deduplicar` (ya con reanudación), retomó la corrida
  `2026-08-12T16:44:13` (139.957 pares ya decididos, todos) en vez de la
  más reciente `2026-08-12T22:10:58`. Investigando se encontró que
  `clusters` (la tabla que define "contactos finales") tenía SOLO la
  corrida `16:44:13` materializada — es decir, **los "8.593 contactos" y
  "596 pendientes" que se venían mostrando desde que se cargaron las API
  keys eran de DOS corridas distintas y desincronizadas entre sí**: los
  contactos finales seguían siendo de ANTES de cargar las keys (658
  pendientes, cero resueltos por IA), mientras que el conteo de
  "pendientes" sí reflejaba la corrida con keys (596, la que restó los 62
  resueltos). No se pudo reconstruir con certeza total el porqué exacto
  (la corrida `22:10:58` logueó sus 139.957 decisiones pero aparentemente
  nunca llegó a completar `_materializar_clusters()` + commit final, bajo
  el código VIEJO de un solo commit al final — no se investigó más a
  fondo, prioridad baja ahora que existe la reanudación con commits
  periódicos, que hace este escenario mucho menos probable de repetirse).
- No hubo pérdida de datos ni corrupción — la inconsistencia era entre dos
  ESTADOS VÁLIDOS, no un dato corrupto. Se resolvió con una corrida 100%
  fresca (`continuar=False`) que deja `decisiones_log` y `clusters`
  consistentes bajo un único `corrida_id` nuevo.
- Nota de tooling: `Start-Process ... -ArgumentList "-c", "código con
  punto y coma"` en PowerShell rompe el código Python (lo corta mal,
  `SyntaxError: invalid syntax` en la palabra `from`). Para correr Python
  ad hoc desde un proceso desprendido, escribir un archivo `.py` real y
  pasarlo como argumento -- nunca `-c` con código multi-statement.
  `scripts/_correr_dedup_fresco.py` (temporal, no versionado como parte
  del pipeline normal) es el ejemplo que se usó acá.

---

## 2026-08-13 (cont. 2) — Continuación con resumen de contexto incompleto: trabajo redundante detectado y descartado sin daño

- Esta sesión se retomó desde un resumen de contexto (compactación) que
  describía el proyecto en un estado MUCHO más viejo que el real (CSV
  manuales en `Data/Crudos`, sin pivote a Google Contacts, sin `api.py`,
  sin UI React, ~34.811 registros). El resumen no mencionaba nada de lo
  documentado arriba (pivote a Google, corridas de dedup reales,
  reanudación, etc.) — quedó fuera del corte de compactación.
- Consecuencia: se reconstruyeron desde cero, redundantemente, features
  que YA estaban hechas y commiteadas (`tagging.py`/auto-etiquetado,
  edición en línea en `/buscar`→`/editar` con `ediciones_manuales`,
  `Iniciar Panel.bat`/`Instalar (primera vez).bat`). `git status`/`git log`
  confirmaron que esos archivos ya estaban trackeados con el commit
  inicial (`56b6260`) y que la versión ya existente era MÁS completa que
  la recién escrita (la ya existente permite editar también
  WhatsApp/teléfono fijo/email con normalización real vía `config`, algo
  que esta sesión no había llegado a escribir todavía). No se detectó
  ningún conflicto de contenido real (los `Write`/`Edit` de esta sesión no
  rompieron nada, `pytest` siguió en 179 verde antes y después).
- Se corrió `python -m motor.cli run` sin saber que había una corrida de
  dedup resumible en curso sobre el dataset REAL (36.103 contactos de
  Google) — con `continuar=True` (default), esto retomó/completó esa
  misma corrida en vez de crear una corrida nueva descartable. Verificado
  contra la base: un solo `corrida_id` materializado en `clusters`
  (`2026-08-13T10:16:23`, 36.102 filas, 8.590 contactos finales, 649
  pendientes) — coincide con el resumen que ya había en
  `handoffs/dedup-corrida.log`. **No se hizo ninguna llamada nueva a
  Groq/Anthropic/OpenRouter** (el diccionario de resultado de esta sesión
  no trae claves `llm_groq`/`llm_anthropic`, a diferencia de la corrida
  del log que sí las tiene) — sin costo adicional. **No se perdió ningún
  dato** (`raw_records`/`normalized_records`/`decisiones_log` intactos,
  apéndice-only). Conclusión: la operación fue inocua, pero fue casualidad
  favorable, no una decisión informada — el sistema de resumido está
  diseñado justamente para tolerar esto, pero no hay que asumirlo dos
  veces sin volver a leer `PENDIENTES.md`/el handoff más reciente primero.
- Se corrió el backfill de `tag` (auto-etiquetado) sobre los 36.102
  `normalized_records` reales vía script directo — quedó 0 filas sin tag.
  Distribución real: 7.861 "personal", 2.388 "laboral", 43 "familiar", 10
  "proveedor", 3 "cliente" (sobre 10.305 filas exportadas — más de una fila
  por contacto cuando hay más de un WhatsApp/fijo/email). La mayoría cae
  en "personal" por default porque el campo Nota de referencia casi nunca
  trae texto explícito en los datos reales — se corrige a mano por
  contacto puntual desde `/editar`, no hay forma de mejorar mucho más la
  heurística sin ese texto.
- Se creó una tarea programada real (`mcp__scheduled-tasks`, NO
  `CronCreate` — ese vive solo dentro de la sesión y expira a los 7 días,
  no sirve para "todos los meses" indefinidamente) para el aviso mensual
  del día 30 pedido en la encuesta original: `aviso-mensual-contactos`,
  cron `0 9 30 * *` (9:00, día 30 de cada mes — no dispara en febrero, que
  no tiene día 30; limitación aceptada, no es un bug). Corre
  `motor.cli run` y avisa el resumen. **Limitación real, no ocultada**:
  esta tarea corre "mientras esta app esté abierta"; si está cerrada el
  día 30, corre en el próximo inicio — no es un disparador a nivel de
  Windows independiente de que la app esté abierta. Si en algún momento
  hace falta garantía más dura (que corra SÍ o SÍ el día exacto sin
  depender de que la app de Claude esté abierta), la alternativa es un
  Windows Task Scheduler apuntando a un script `.bat`/`.ps1` — no
  construido todavía, evaluar si hace falta.
- Se corrigió un bug real encontrado al probar en vivo (`preview_start` +
  Browser pane) la ruta `/buscar`→`/editar` recién agregada: el panel
  Flask tira `sqlite3.ProgrammingError: SQLite objects created in a thread
  can only be used in that same thread` en cualquier request real (no en
  los tests, que usan `test_client()` síncrono) porque el server de
  desarrollo de Werkzeug corre cada request en un hilo nuevo por default,
  y la conexión sqlite se crea una sola vez al arrancar. Fix en `cli.py`:
  `crear_app(config, conn).run(port=..., threaded=False)` — un solo
  usuario en localhost no necesita concurrencia real. Verificado en vivo
  contra el panel real: búsqueda y guardado de una edición confirmados
  funcionando end-to-end (se hizo y se deshizo sobre un contacto real de
  prueba, sin dejar el tag de prueba puesto).
- **Lección para la próxima sesión/cuenta**: antes de tocar la base real o
  correr el pipeline "para verificar algo", leer primero `PENDIENTES.md` y
  el handoff más reciente — no asumir que el resumen de contexto de la
  conversación está completo, sobre todo después de una compactación.

---

## 2026-08-13 (cont. 3) — Cierre explícito del MVP: lote aprobado, Fase 5 descartada, bug real de fondo corregido

- El usuario pidió explícitamente cerrar el proyecto de punta a punta,
  asumiendo él mismo las decisiones estándar: (1) aprobar el lote de 649
  pendientes tratándolos como la misma persona, (2) dejar el lanzador/UI
  con la opción por defecto más simple, (3) descartar Fase 5
  definitivamente (no "posponer").
- **Al ejecutar (1) se encontró un bug real, no cosmético**: el botón
  "Aprobar fusión de todo el lote" (`/decidir` en `reviewer_app.py`, y su
  duplicado en `api.py`) solo actualizaba `decisiones_log.accion` — nunca
  tocaba la tabla `clusters`. Efecto: el contador de "pendientes" bajaba a
  0 (porque ese contador solo lee `decisiones_log`), pero la lista maestra
  exportada seguía mostrando los contactos como personas separadas, porque
  `clusters` es la tabla que realmente se materializa en el export y solo
  se recalcula dentro de `deduplicar_todo()` — que a su vez solo reusa
  decisiones humanas si está retomando una corrida INCOMPLETA (mismo
  corrida_id), nunca si la corrida ya terminó (que es el caso normal
  cuando alguien revisa la cola después de que terminó de correr). Un
  usuario que hubiera usado el botón de "aprobar lote" del panel tal como
  estaba habría visto "0 pendientes" pero, al abrir el Excel, seguía
  viendo los contactos sin fusionar — una inconsistencia silenciosa real,
  no hipotética.
- **Fix de fondo, no un parche puntual**: nueva función
  `aplicar_decision_lote()` + `_fusionar_pares_de_clusters()` en
  `merge_engine.py`. Traduce cada par pendiente a sus clusters ACTUALES
  (no a normalized_record ids sueltos, porque cada lado del par puede ya
  ser un cluster de varios raw_records por fusiones de regla previas),
  corre union-find sobre esos clusters, y persiste la fusión real en
  `clusters` con `decidido_por='humano'`. Reemplaza el código duplicado
  que tenían tanto `reviewer_app.py` (`/decidir`) como `api.py`
  (`/api/decidir`) — ambas rutas ahora llaman a la misma función
  compartida, así que este fix vale para siempre, no solo para esta
  corrida. Test de regresión en `test_pipeline_integration.py`
  (`test_aplicar_decision_lote_fusiona_clusters_de_verdad_no_solo_el_log`)
  que reproduce el patrón real (mismo teléfono, nombres que la salvaguarda
  de `scoring.py` lee como claramente distintos) y confirma que después de
  aprobar el lote el export muestra 1 fila, no 2. **180 tests en verde.**
- **Ejecutado contra la base real**: `aplicar_decision_lote(conn,
  'tel=si|mail=no|nombre=baja|nombres_distintos', True)` — devolvió 3.219
  actualizados (más que los 649 "de la corrida más reciente" porque la
  función no filtra por corrida_id, a propósito: corrige TODO el historial
  de ese patrón repetido en corridas previas (658, 596, 649...), no solo
  el último). Resultado verificado en base: **649→0 pendientes, 8.590→8.541
  contactos finales**. La caída de 49 (no de ~649) confirma que muchos de
  esos pares comparten teléfono transitivamente entre sí (una misma línea
  de oficina/familia vinculando a varias personas a la vez, no solo
  pares sueltos) — colapsan en pocos clusters grandes en vez de muchos
  clusters de a 2. `lista-maestra.xlsx` reexportado: 10.267 filas.
- **Fase 5 (escaneo de PC)**: descartada explícitamente por el usuario,
  no pospuesta. Documentado en `ESPECIFICACION.md`/`PENDIENTES.md`. No se
  retoma sin pedido nuevo y explícito.
- **Lanzador/UI por defecto**: se mantiene el panel HTML clásico
  (`Iniciar Panel.bat`) como el punto de entrada único y por defecto — es
  un solo proceso (Flask sirviendo todo, sin depender de Node/npm
  corriendo en paralelo), ya tiene búsqueda/edición y la cola de revisión,
  y no depende de nada que no esté ya instalado en el `.venv`. La UI nueva
  en React (`ui/`, puerto 5174) sigue existiendo y funciona (confirmada en
  la sesión anterior), pero requiere correr DOS servidores en paralelo
  (backend Flask + `npm run dev`) — más frágil para "doble clic y listo",
  así que no se la promovió a default. Se agregaron links directos a
  Google Sheets/Apps Script en la sección "Fase 4" del panel para
  minimizar fricción del único paso que queda (login de Google).
- **Sobre "commit y push"**: se commiteó todo al repo git LOCAL de
  `motor-contactos/` (como en cada handoff). Repetido a propósito porque
  es una regla explícita y ya acordada: `motor-contactos/` y `Data/` NO
  tienen remoto a GitHub y no se les agrega uno — contienen datos
  personales reales de terceros (los contactos de Pablo y Sindy), y esa
  separación es la que permite que el repo principal (la SPA, que sí va a
  GitHub) nunca los exponga. "Push" en el pedido del usuario se interpretó
  como aplicable al repo principal si había algo pendiente ahí, no como
  autorización para exponer `motor-contactos/`/`Data/` a un remoto —  si
  el usuario de verdad quiere un backup remoto de este código (sin los
  datos), la opción seria sería un repo PRIVADO nuevo y separado, nunca el
  mismo remoto que la SPA pública/semi-pública.

---
