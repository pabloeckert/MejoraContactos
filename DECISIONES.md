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

## 2026-08-13 (cont. 4) — Auditoría contra la encuesta original: 2 gaps reales encontrados y cerrados

- El usuario volvió a pegar el resumen completo de la encuesta original de
  16 fichas (la misma que dio origen a "Spec cerrada v2") y pidió
  confirmar si de verdad estaba todo resuelto antes de "olvidarse". Se
  auditó ficha por ficha contra el código y la base real, no de memoria.
- **Confirmado sin cambios** (ya satisfecho): 4.1 vs 4.2 (LLM decide en la
  banda media, coincide con "que la IA decida sola"); Nombre/Apellido como
  columnas separadas en el export (verificado en el xlsx real); una fila
  por WhatsApp/fijo/email, nunca dos valores en la misma celda (verificado
  con un barrido completo del xlsx real, 0 celdas con separadores).
- **Gap real #1 — Ficha 7.1, "campos imprescindibles"**: Cumpleaños y
  Foto estaban en la lista de campos imprescindibles del usuario pero
  nunca se pidieron a la People API ni se exportaron — un olvido de scope
  real, no una decisión consciente. Fix: `_CAMPOS_PERSONA` ahora pide
  `birthdays,photos`; `_persona_a_campos()` los mapea (cumpleaños como
  `DD/MM/AAAA` o `DD/MM` si Google no comparte el año; foto como URL,
  descartando la silueta genérica que Google marca con `"default": true`
  cuando el contacto no tiene foto real); `normalized_records` suma las
  columnas `cumpleanos`/`foto_url` (con migración `ALTER TABLE` real,
  generalizada — antes solo migraba `ediciones_manuales`, ahora
  `_COLUMNAS_NUEVAS` es un dict de tabla→columnas, cualquier tabla puede
  sumar columnas nuevas sin romper una base ya existente); `export.py`
  y `api.py` (`_serializar_contacto`) los exponen. 5 tests nuevos.
- **Backfill de los 36.103 contactos ya importados**: el mecanismo
  incremental normal (`importar_google_contactos`, salta contactos cuyo
  `etag` de Google no cambió) NO iba a traer estos dos campos solo porque
  el código ahora los pide — el etag de un contacto en Google no cambia
  porque NOSOTROS decidamos pedir un campo más. Reimportar todo de cero
  tampoco servía: `importar_google_contactos` solo sabe INSERTAR, no
  "actualizar si ya existe", así que hubiera duplicado los 36.103
  `raw_records`. Se escribió `scripts/backfill_cumpleanos_foto.py`: pide
  SOLO `birthdays,photos` en una pasada paginada de `connections.list`
  (liviana, mismo volumen de páginas que un import normal pero sin traer
  el resto de los campos), matchea por `resourceName` contra los
  `raw_records` ya existentes, y actualiza `raw_json` +
  `normalized_records` directamente. **Excepción deliberada y acotada**
  a la regla "raw_records nunca se edita": acá se edita, pero solo para
  completar dos campos que deberían haber estado desde el import original
  y se cayeron por un olvido de scope — no es un precedente para editar
  raw_records por ningún otro motivo (limpieza de datos, corrección de
  errores, etc. siguen prohibidos ahí). Resultado real: **2.288
  actualizados en la cuenta de Pablo, 3.267 en la de Sindy** (5.555 en
  total — no todos los 36.103 tienen cumpleaños o foto cargados en
  Google, esto es exactamente cuántos sí). Lista maestra reexportada:
  **896 filas con cumpleaños, 2.824 con foto** (de 10.267 filas / 8.541
  contactos).
- **Gap real #2 — Ficha 6.1, "info visible por contacto dudoso"**: la
  cola de revisión (`/revisar`) mostraba solo `normalized #123 — #456
  (score 0.61)` — un usuario no tiene forma de decidir "fusionar o no"
  mirando dos ids numéricos pelados. La encuesta pedía explícitamente
  nombre completo, teléfono, email, organización, de qué fuente salió
  cada uno, y foto si tiene. Fix: `_agrupar_pendientes()` ahora arma un
  `_resumen_normalized()` por cada lado del par (nombre+apellido,
  organización, primer teléfono, primer email, `source_file` — hoy
  `google:pablo:...`/`google:sindy:...` en vez de `pablo.csv`/`Sindy.csv`
  porque cambió la fuente, ver pivote del 2026-08-11 — y link a la foto
  si tiene). La plantilla de `/revisar` pasó de una lista de ids a una
  tarjeta por par con toda esa info. Mismo fix sirve para el panel
  clásico Y la API de la UI nueva (`api.py` importa la misma función). No
  había ningún caso pendiente para probar esto en vivo contra la base
  real (0 pendientes después del cierre de la sesión anterior) — se
  probó con un caso sintético que reproduce el patrón real (mismo
  teléfono, nombres claramente distintos) en el test nuevo
  `test_pagina_revisar_muestra_datos_de_contacto_no_solo_ids`.
- **184 tests en verde** (180 → 184: 2 de `google_contacts_source`
  (cumpleaños con/sin año, foto default descartada), 1 de
  `normalize_pipeline` (los campos nuevos pasan de raw a normalizado), 1
  de `reviewer_app` (la cola de revisión muestra datos, no ids)).
- **Nota sobre "guardar en memoria" (Ficha 15.1)**: el usuario pidió
  explícitamente que se guarde en la memoria persistente de Claude Code
  (no en este repo) el contexto de que este proyecto existe y sus
  patrones son reusables para desarrollos futuros (un CRM parecido para
  un cliente, una versión portable para llevar a otros clientes, etc.).
  Se guardó una memoria de tipo "project" fuera de este repo (en el
  perfil de Windows del usuario, `C:\Users\Pablo\.claude\...\memory\`) —
  no acá, porque memoria y código son sistemas de persistencia distintos
  y esa carpeta no es parte de ningún repo git.
- **Ficha 15 (el resto del wishlist)**: extracción de Facebook/Instagram/
  TikTok/sitios web, importación directa de HubSpot/Mailchimp/Brevo,
  lectura de cuentas de mail, integración con "MejoraWS" (WhatsApp),
  agente autónomo en segundo plano que aprende y se anticipa, identidad
  visual de marca Mejora Continua en la interfaz, y la idea de
  productizar esto como CRM/herramienta portable para clientes — **nada
  de esto está construido ni forma parte del alcance actual**. Es
  explícitamente un wishlist a futuro (así lo tituló el propio usuario:
  "lo que faltó preguntar"), no una carencia del MVP cerrado. No se
  inventa ni se empieza nada de esto sin que el usuario lo pida de nuevo,
  puntual y explícito, en una conversación aparte — mismo criterio que ya
  se aplicó con Fase 5.

---

## 2026-08-13 (cont. 5) — Sesión larga nocturna: retomar Ficha 15 (wishlist), sin supervisión

El usuario, contento con el cierre del MVP, pidió explícitamente retomar
varios ítems de la Ficha 15 (antes marcados como "wishlist a futuro, no
construido") en una sola sesión larga sin su presencia ("me levanto de la
PC... cuando vuelva tiene que estar todo listo"), dejando toda decisión de
diseño a criterio propio. Items pedidos: UI más pulida + ejecutable real,
Fase 4 lista para un clic, identidad Mejora Continua (`/anthropic-skills:
mejora-continua-brand`), HubSpot/Mailchimp/Brevo, lectura de contactos de
mail, integración WhatsApp (MejoraWS), agente autónomo. Pidió usar
`/anthropic-skills:optimo-de-uso` (consultado: confirmó que el entorno
actual -- Claude Code, Sonnet -- ya es el correcto, sin cambios) y
`/anthropic-skills:master-vision` -- **decisión: NO se usó**, es el coach
personal de Pablo (horóscopo/familia/liderazgo de Mejora Continua), no
aplica a decisiones de arquitectura de software.

- **MejoraWS existe de verdad**: el usuario interrumpió a mitad de turno
  para corregir que MejoraWS vive en `C:\Github\Herramientas\Mejora
  Contacto` y pidió renombrar el directorio a `MejoraWS`. Hecho (`Rename-
  Item` falló por lock de Windows -- se resolvió con `robocopy /MOVE` +
  borrado del directorio viejo, que quedó vacío pero no se pudo eliminar
  del todo por el mismo lock; inofensivo, sin archivos adentro). Resultó
  ser un Electron+React+Baileys real para mandar WhatsApp, YA con la
  identidad de marca Mejora Continua aplicada, con import de CSV
  (columnas `nombre,telefono,variable`) -- mejor de lo previsto, permitió
  una integración real (export directo en su formato) en vez de solo
  links `wa.me` genéricos.

- **UI rediseñada con marca real** (`ui/`): paleta/tipografía/logo del
  manual real de Mejora Continua (`C:\Users\Pablo\.claude\skills\mejora-
  continua-brand\assets\`) -- Bw Modelica + League Spartan embebidas
  localmente (sin depender de internet), isotipo como favicon/ícono de
  ventana, azul primario con rojo/amarillo como acento puntual (nunca
  fondo dominante, regla del manual). Revierte a propósito la decisión
  anterior de "sin marca" (comentario viejo en `tailwind.config.js`) --
  pedido explícito del usuario esta vez. De paso, bug real encontrado y
  arreglado: `ContactsTable.tsx` mostraba un "?" pelado para contactos sin
  nombre (`n + a || "?"`) -- ahora "(sin nombre)" + un avatar con "·".

- **App de escritorio real** (`desktop_app.py` + `App/MotorContactos.exe`,
  PyInstaller): la UI React compilada + la API JSON, servidas por Flask,
  envueltas en una ventana nativa vía `pywebview` -- sin terminal, sin
  pestaña de navegador. Dos bugs reales encontrados y arreglados
  construyendo esto (no hipotéticos, verificados corriendo el .exe real):
  1. Mismo bug de threading que ya se había visto en el panel clásico
     (sqlite3 no es thread-safe entre hilos) -- la conexión se crea AHORA
     adentro del hilo que sirve Flask, no se pasa desde afuera.
  2. **Resolución de rutas en el .exe empaquetado**: `config.yaml` define
     rutas relativas a SÍ MISMO (`../Data/Crudos`, etc.) que apuntan a los
     datos reales -- si el .exe hubiera usado un config.yaml embebido en
     el bundle (`sys._MEIPASS`) en vez del real, el pipeline habría
     corrido en silencio contra una carpeta `Data/` vacía o distinta. Se
     decidió NO embeber `config.yaml` en el build y en cambio buscar el
     real subiendo desde la ubicación del .exe (`cli.py:
     _ruta_config_real`), con error explícito si no lo encuentra -- nunca
     un fallback silencioso a datos equivocados. Verificado en vivo: el
     .exe real, corriendo desde `App/`, conecta a la base real (8.541
     contactos), sirve la UI con marca, todo end-to-end. `App/`, `build/`,
     `*.spec` van a `.gitignore` (artefacto generado, `scripts/
     build_exe.ps1` lo reconstruye).

- **Fase 4 (Sync a Google) "lista para un clic"**: `Sync.gs` ahora también
  sincroniza Cumpleaños de vuelta a Google (campo nuevo de esta sesión,
  antes no se pusheaba); nueva sección "Sync a Google" en la UI React
  (`SyncPanel.tsx`) con los 4 pasos y links directos a Sheets/Apps Script,
  espejo de lo que ya tenía el panel clásico. Sigue sin poder probarse en
  vivo -- requiere login de Google del usuario, no lo puede hacer Claude.

- **HubSpot/Mailchimp/Brevo**: NO se construyeron 3 extractores nuevos --
  se extendió `column_mapping.py` (ya existente, alias ES/EN genéricos)
  con los encabezados típicos de cada plataforma ("Phone Number",
  "Company Name", "Street Address", "State/Region" de HubSpot; "Email
  Address", "Address" de Mailchimp; "FIRSTNAME"/"LASTNAME"/"SMS" sin
  espacio de Brevo, sus merge tags tal cual). Más simple, más
  mantenible, y sirve para cualquier CSV futuro con encabezados
  parecidos, no solo estas 3 plataformas nombradas. 3 tests con
  encabezados reales de cada una.

- **Lectura de contactos desde Gmail**: en vez de parsear encabezados de
  mail a mano (frágil, reinventa lo que Google ya resuelve mejor), se usa
  `people.otherContacts` de la People API -- "gente con la que hubo
  intercambio de mail pero nunca se guardó como contacto", que es
  exactamente el pedido. Requiere un scope OAuth DISTINTO al de Fase 4
  (`contacts.other.readonly` vs `contacts.readonly`) y por eso un token
  separado (`token_<cuenta>_gmail.json`) -- activarlo pide un login nuevo,
  aparte del ya hecho para Fase 4, no lo puede hacer Claude. Entra con
  `confianza_extraccion='baja'` a propósito (auto-derivado, más ruidoso
  que un contacto guardado a mano -- misma salvaguarda que ya usan los
  extractores de Fase 3, nunca se fusiona en silencio). Nuevo comando
  `motor.cli importar-otros-contactos <cuenta>`.

- **WhatsApp / MejoraWS**: `exportar_whatsapp_csv()` en `export.py` --
  mismo dato que la lista maestra, formato exacto que pide MejoraWS
  (nombre completo, teléfono E.164 SIN el "+", tag como "variable" de
  personalización opcional). Botón en la UI React y en el panel clásico.
  6.046 contactos reales exportados y verificados en el formato correcto.

- **Agente autónomo ("aprende, se anticipa")**: acotado a lo real y
  concreto en vez de "IA que aprende sola" en abstracto --
  1. *Corre solo*: la tarea programada mensual (`aviso-mensual-
     contactos`) ahora también importa de Google (antes solo
     reprocesaba lo ya importado) -- de verdad autónoma, no solo un
     resumen de lo que ya había.
  2. *Aprende*: ya existía (`dedup/learning.py`, ajuste de umbral por
     patrón según decisiones humanas) -- se documentó mejor, no se
     reconstruyó.
  3. *Se anticipa*: `anomalias.py` nuevo -- Ficha 9.2 de la encuesta
     original ("alerta si aparece algo raro, ej. un teléfono con
     muchísimos nombres distintos") nunca se había construido. Detecta
     teléfonos compartidos por más de 5 contactos FINALES distintos (ya
     deduplicados). Corrido contra la base real: 0 anomalías -- limpio.
     Se agregó al aviso mensual automático.

- **194 tests en verde** (180 → 194: 3 HubSpot/Mailchimp/Brevo, 2
  otherContacts, 2 anomalías, 2 export whatsapp, 3 desktop_app, 2
  otherContacts-scope). `TUTORIAL.md` nuevo con el paso a paso de todo lo
  de esta sesión.

- **Lo que sigue bloqueado, honestamente, y no tiene solución posible sin
  el usuario presente**: Fase 4 en vivo (login Google), "otros contactos"
  en vivo (login Google, scope nuevo), cualquier integración real con
  HubSpot/Mailchimp/Brevo vía API (solo se resolvió el camino CSV, que no
  necesita credenciales -- una integración por API necesitaría que el
  usuario generara sus propias API keys en cada plataforma). Documentado
  en `PENDIENTES.md` para que quien retome esto no asuma que ya está
  probado en vivo.

---

## 2026-08-13 (cont. 6) — Feedback en vivo sobre la tabla de contactos: bug real + rediseño UX

El usuario abrió la app de escritorio y pidió en vivo: ver todos los
campos sin doble clic, columnas angostables/ensanchables, y un filtro
combinado "mejor que Excel". Pidió `/optimo-de-uso` (confirmó Sonnet +
Code, sin cambios), `/design:ux-copy` (patrones de copy aplicados: "X de Y
contactos" para el contador, estructura qué-es/por-qué-vacío/cómo-seguir
para el empty state de filtros vacíos con acción "Limpiar filtros") y
`/anthropic-skills:mejora-continua-brand` (ya aplicado). **NO se usó
`/anthropic-skills:master-vision`** otra vez — sigue siendo el coach
personal de Pablo, no una herramienta de decisiones de UI.

- **Bug real encontrado antes de tocar el diseño**: `/api/contactos`
  clavaba `tamano` en un tope de 500 server-side — con 8.541 contactos
  reales, la tabla NUNCA había mostrado más de los primeros 500 desde que
  se construyó (silencioso, sin error, simplemente el resto no estaba
  disponible para filtrar/ver). Tope subido a 20.000; la UI ahora carga
  toda la lista una sola vez al entrar y filtra/busca 100% client-side
  (instantáneo, sin ida y vuelta al server por cada tecla — apropiado
  para este volumen de datos, no lo sería para millones de filas). Test
  de regresión (`test_api_contactos_tamano_puede_superar_500`).
- **`ContactsTable.tsx` reescrito**: 12 columnas configurables (antes 5
  fijas, con Cargo/Empresa combinados en un string) + Nombre fijo a la
  izquierda. Por columna: mostrar/ocultar (menú "Columnas"), ancho
  redimensionable a mano (drag del borde), filtro de texto-contiene (Tag
  usa multiselect en vez de texto libre, mismo enum que
  `motor/tagging.py`). Anchos y visibilidad persisten en `localStorage`
  entre sesiones. Búsqueda global instantánea sobre todos los campos a la
  vez (con normalización de acentos, "Posadas"/"posadas"/"pósadas"
  matchean igual). Contador "X de Y contactos" y botón "Limpiar N
  filtros" cuando hay algo activo.
- **Bug de UX encontrado probando en vivo, no hipotético**: el menú
  "Columnas" y el filtro de una columna podían quedar abiertos los dos a
  la vez (verificado con `javascript_tool`, `document.querySelectorAll`
  mostraba las opciones de ambos popovers superpuestas). Arreglado: abrir
  uno cierra el otro.
- **`types.ts` tenía un gap real**: `Contacto` no incluía `cumpleanos` ni
  `foto_url` (campos agregados a `api.py` en una sesión anterior, nunca
  reflejados en el tipo de TypeScript) — corregido, ahora la columna
  Cumpleaños tiene tipo real en vez de depender de acceso no tipado.
- Verificado en vivo con `javascript_tool` (los clicks del `computer` tool
  no registraban de forma confiable contra esta ventana -- se usó
  disparo de eventos DOM nativo como alternativa, más confiable):
  búsqueda global (8.541 → 1.285 con "posadas"), toggle de columnas,
  filtro de tag (8.541 → 3 con "cliente", los 3 con el tag correcto),
  resize (160px → 240px, persistido en localStorage).
- **195 tests en verde** (194 → 195: 1 nuevo en `test_api.py`). `.exe`
  reconstruido y `TUTORIAL.md` actualizado con la sección de la tabla.

---

## 2026-08-14 — Auditoría real (.docx) + segunda ronda de revisión UX/seguridad

- El usuario pidió una auditoría técnica formal en `.docx` (identidad
  Mejora Continua) actuando como Lead Systems Architect, generada con
  `scripts/generar_auditoria.py` (python-docx). Fuentes ya instaladas de
  una sesión anterior (verificado en el registro de Windows antes de
  hacer nada, no se reinstaló). **Verificación real, no solo "no tiró
  error"**: se abrió el .docx con Word de verdad vía COM y se le preguntó
  a Word qué fuente estaba usando en cada bloque — confirmó "Bw Modelica
  Bold" en títulos, "Bw Modelica Medium" en subtítulos (color RGB
  `#1A3D84` también confirmado), "League Spartan" en cuerpo, cero
  apariciones de "Calibri" (el fallback de Word) en todo el XML. El
  contenido se armó leyendo el código real en el momento (phone_normalizer,
  scoring.py, blocking.py, staging_db.py, requirements.txt/package.json),
  no de memoria.
- El usuario compartió una revisión crítica de esa auditoría (aparente
  segunda opinión de otra IA/herramienta) con hallazgos de UX y riesgos
  operativos. Se verificó cada reclamo contra el código real ANTES de
  actuar — dos de los cuatro reclamos de UI tenían la causa raíz distinta
  a la descripta pero el problema de fondo era real igual:
  - "Columnas" tapaba datos al abrirse: cierto, el dropdown se abría
    `absolute` sobre el inicio de la tabla.
  - Popovers de filtro en columnas del extremo derecho (Tag, Nota) se
    salían del viewport: ya estaba documentado como autocrítica propia.
  - "(sin nombre)" + guiones vacíos generaba ruido visual: cierto.
  - Rutas absolutas de Windows visibles en la interfaz: cierto pero no en
    el sidebar como tal (no hay texto de rutas ahí) — el mensaje de
    resultado tras "Exportar a Excel"/"Exportar para WhatsApp" mostraba
    la ruta completa (`_ejecutar_accion` en `reviewer_app.py` interpolaba
    el `Path` completo, no el nombre de archivo).
- **Fix elegido para la oclusión (más ambicioso que un parche puntual)**:
  en vez de reposicionar el dropdown de "Columnas" y cada popover de
  filtro por separado, se unificaron los DOS mecanismos en un solo panel
  lateral fijo (`PanelColumnasFiltros`, `fixed right-0`, ancho 22rem) —
  columnas visibles + filtro de texto por campo + multiselect de Tag, todo
  en un lugar siempre 100% visible sin importar el ancho/scroll de la
  tabla. Los encabezados de columna ahora solo muestran un punto azul si
  esa columna tiene un filtro activo (sin popover propio) — soluciona la
  oclusión Y el desborde de viewport con el mismo cambio, no dos fixes
  separados.
- **KPI compactos**: `StatCard` pasó de tarjeta (~90px alto, ícono en
  cuadrado + número + label apilados) a línea inline compacta
  (ícono+número+label en una fila, separadores verticales entre las 4
  métricas) — una sola barra de ~50px en vez de una fila de tarjetas.
- **Identidad para contactos sin nombre**: antes mostraba literalmente
  "(sin nombre)" pelado. Ahora `identidad()` en `ContactsTable.tsx` usa el
  mejor identificador disponible (WhatsApp > teléfono fijo > email >
  empresa) como texto principal, con una etiqueta secundaria "Sin nombre"
  en gris chico debajo — nunca deja al usuario sin ningún dato visible.
- **Avatares con paleta de marca**: `COLORES_AVATAR` pasó de la paleta
  genérica de Tailwind (azul/verde/violeta/ámbar/rosa/cian) a variantes de
  los 3 colores de marca (azul/rojo/amarillo, más 2 neutros de apoyo) —
  el amarillo lleva texto oscurecido a mano para cumplir contraste WCAG
  sobre fondo claro.
- **Rutas absolutas fuera de los mensajes**: `_ejecutar_accion` ahora
  interpola `destino.name` (nombre de archivo) en vez de `destino` (Path
  completo) para "exportar"/"exportar-whatsapp"/"run" — mismo fix sirve
  para el panel clásico y la UI React (comparten la función).
- **`Sync.gs` — modo DRY_RUN por defecto**: hallazgo de la revisión
  (impacto alto, justificado: el script nunca se probó en vivo, un fallo
  de lógica podría duplicar/corromper la agenda real). Se agregó
  `CONFIG.DRY_RUN = true` como default — la primera corrida de
  `sincronizarContactos()` no escribe NADA real (ni en Google Contacts ni
  las columnas de tracking del Sheet), solo loguea fila por fila qué
  haría. Recién cambiando `DRY_RUN` a `false` a mano (después de revisar
  el log) la corrida siguiente escribe de verdad. Documentado en el
  encabezado de `Sync.gs`, `google-apps-script/README.md`, `SyncPanel.tsx`
  y la sección Fase 4 del panel clásico — los 4 lugares que explican este
  paso quedaron consistentes.
- **Tokens OAuth cifrados en reposo (DPAPI)**: hallazgo de la revisión
  (impacto medio, justificado: `token_*.json` daba acceso real a Gmail/
  Contacts de Pablo y Sindy y vivía en texto plano). Nuevo módulo
  `token_crypto.py` — `ctypes` + `crypt32.dll` (DPAPI de Windows), sin
  agregar ninguna dependencia nueva. Migración transparente: un token
  viejo en texto plano se sigue leyendo igual, y queda re-escrito cifrado
  la próxima vez que se guarde. **Los dos tokens reales (`token_pablo.
  json`, `token_sindy.json`) se migraron en esta misma sesión** — no se
  dejó para "la próxima vez que se use" — con el siguiente protocolo de
  seguridad, dado que son credenciales reales de acceso a las cuentas
  reales de Pablo y Sindy: (1) backup de ambos archivos originales al
  scratchpad ANTES de tocar nada, (2) verificación del ciclo completo
  cifrar/descifrar contra una COPIA del token real de Pablo (nunca el
  original) confirmando que el contenido decodificado es bit-a-bit igual
  al original, con los "magic bytes" de DPAPI (`\x01\x00\x00\x00\xd0\x8c...`)
  confirmando que es cifrado real de Windows y no un placeholder, (3)
  recién ahí se migraron los dos archivos reales, con assert
  antes/después comparando el JSON decodificado contra el original en
  cada paso, (4) verificación final cargando `Credentials.
  from_authorized_user_info()` (la misma función que usa
  `obtener_credenciales()` en producción) contra los dos tokens ya
  migrados, confirmando `refresh_token` presente en ambos. 5 tests nuevos
  en `test_token_crypto.py`, todos con archivos sintéticos en `tmp_path`
  — nunca tocan los tokens reales.
- **200 tests en verde** (195 → 200: 5 de `test_token_crypto.py`). `.exe`
  reconstruido y verificado en vivo tras el rediseño de UI.

---

## 2026-08-14 (cont.) — Los 2 hallazgos restantes de la revisión: ausencia de auto-build y fallo silencioso de Tesseract

El usuario pidió cerrar los dos hallazgos que habían quedado sin encarar de
la revisión pegada en la ronda anterior (ambos MEDIO/BAJO en el risk matrix
del reporte).

- **Ausencia de auto-build del ejecutable**: el reporte proponía CI clásico
  (ej. GitHub Actions). Se descartó esa forma concreta a propósito — este
  repo no tiene remoto ni lo va a tener (decisión ya tomada y documentada
  arriba, 2026-08-13 cont. 3: contiene datos personales reales de terceros),
  así que no hay dónde correr un runner de CI. El problema de fondo sí es
  real: `App/MotorContactos.exe` es un artefacto generado
  (`.gitignore`) que solo se actualiza si alguien se acuerda de correr
  `build_exe.ps1` a mano después de tocar `ui/src` o el backend — puede
  quedar viejo en silencio indefinidamente. Se ató la solución al
  checkpoint que YA existe y YA se corre al cerrar cada ronda:
  `scripts/handoff.ps1` ahora compara el `LastWriteTime` más reciente de
  `ui/src`, `src/motor` y `assets` contra el del `.exe` actual, y si hay
  código más nuevo, llama a `build_exe.ps1` solo, antes de correr los
  tests — sin tocar nada si no hace falta (no reconstruye en cada handoff,
  solo cuando hay cambios reales). El resultado (reconstruido / al día /
  falló) queda en la sección "Ejecutable" del reporte de handoff.
  **Probado en vivo de punta a punta en esta misma sesión**: primer intento
  se cortó a mitad del build de PyInstaller por un error de tooling propio
  (un `Select-Object -First N` sobre la salida de `handoff.ps1` cerró el
  pipeline antes de tiempo y mató el proceso — PowerShell corta upstream
  cuando `-First` ya juntó lo que necesitaba; quedó un `build/` a medio
  escribir, sin daño real porque `git status` seguía limpio y no se había
  tageado el handoff). Se limpió el residuo y se corrió de nuevo en
  background sin truncar la salida — terminó bien: detectó el `.exe`
  desactualizado, lo reconstruyó, y el binario nuevo se lanzó a mano
  (`App\MotorContactos.exe escritorio`) confirmando título de ventana
  correcto y `/api/stats` respondiendo con los datos reales (8.541
  contactos).
- **Fallo silencioso de Tesseract-OCR**: `image_ocr_extractor.py` atrapaba
  CUALQUIER excepción de `pytesseract.image_to_string` (Tesseract no
  instalado, imagen corrupta, lo que sea) en el mismo `except Exception`
  genérico y devolvía `[]` sin loguear nada — el docstring del módulo
  afirmaba que esto "queda logueado (ver ingest.py)", pero eso era falso: al
  atraparse adentro del propio extractor, la excepción nunca llegaba al
  `try/except` de `ingest.py` que sí imprime un aviso por archivo. Efecto
  real: si a alguien se le pasa por alto instalar el binario de Tesseract,
  procesar una carpeta entera de capturas de pantalla no da NINGUNA señal
  de que el problema es "falta un programa", se ve idéntico a "ninguna de
  estas imágenes tenía un contacto". Fix: se separó
  `pytesseract.TesseractNotFoundError` del resto de excepciones — ese caso
  específico imprime un aviso claro (con el link de instalación) UNA sola
  vez por corrida (flag de módulo, no por archivo, para no inundar la
  consola si hay cientos de capturas), el resto de errores (imagen
  corrupta, formato no soportado) se mantiene en silencio como antes,
  porque ESO sí es ruido esperado por archivo, no un problema de entorno.
  Test de regresión nuevo mockeando `pytesseract.image_to_string` para
  forzar el caso específico (no se puede depender de si la máquina que
  corre los tests tiene o no Tesseract instalado) y confirmando que el
  aviso sale exactamente una vez con dos imágenes procesadas.
- **201 tests en verde** (200 → 201: 1 de `test_image_ocr_extractor.py`).

---

## 2026-08-14 (cont. 2) — Nueva instrucción permanente: autonomía total, y por qué Fase 4 sigue sin poder probarse en vivo

- **El usuario pidió explícitamente, de acá en adelante, no esperar
  respuesta suya para actuar** — "es más fácil corregir lo que veo que
  sentarme y esperar cada vez que preguntes". Esto refuerza (no reemplaza)
  la dogma ya existente de "Continuous work mode"/"PM autonomy" en
  CLAUDE.md — el único límite que sigue vigente, y que el propio CLAUDE.md
  ya nombraba como ejemplo explícito, es cuando el siguiente paso requiere
  físicamente las manos/ojos/login del usuario (login de Google es el
  ejemplo textual). Cualquier cuenta de Claude que retome este proyecto
  debe operar bajo este criterio: decidir y avanzar sin encuestas, y
  reservar las preguntas solo para bloqueos genuinos de ese tipo.
- **Se intentó probar Fase 4 (`Sync.gs`) contra una cuenta de prueba,
  pedido explícito de esta sesión.** Sigue bloqueado por la misma razón ya
  documentada varias veces en este archivo y en `PENDIENTES.md`: el primer
  `sincronizarContactos()` de un proyecto de Apps Script nuevo exige que el
  dueño de la cuenta de Google click-through un consentimiento OAuth real
  en el navegador ("Google no verificó esta app" → Avanzado → Ir a
  [proyecto]) — no hay forma de completar eso sin la presencia física del
  usuario, ni con el nuevo pedido de autonomía total ni con ninguna otra
  instrucción posible (entrar credenciales/otorgar permisos OAuth en
  nombre de otra persona está fuera de lo que Claude puede hacer, es una
  regla de seguridad, no una preferencia de flujo de trabajo).
- **Lo que sí se hizo de forma autónoma para dejar el paso bloqueante lo
  más corto posible cuando el usuario tenga 5 minutos**: se releyó
  `Sync.gs` completo de punta a punta buscando bugs antes de su primera
  corrida real contra datos reales (sin hallazgos — DRY_RUN, reintento con
  backoff en 429, manejo de contacto borrado en Google con fallback a
  crear de nuevo, todo se ve correcto) y se generó
  `lista-maestra-PRUEBA-fase4.xlsx` (enviado directo al usuario, no
  versionado en el repo — 3 contactos 100% ficticios, ninguno real, con la
  MISMA estructura exacta que produce `export.py`: mismo nombre de
  pestaña "Lista maestra", mismas 15 columnas/encabezados en el mismo
  orden, mismo estilo de encabezado azul de marca) para que el usuario
  solo tenga que: Sheet en blanco → Archivo → Importar → Subir ese archivo
  → Extensiones → Apps Script → pegar `Sync.gs` → Servicios → agregar
  People API → correr `sincronizarContactos()` (dry-run) → revisar el log
  → pasar `DRY_RUN` a `false` → correr de nuevo → confirmar en
  contacts.google.com → borrar los 3 contactos de prueba. Este archivo de
  prueba usa teléfonos con el prefijo `555` (convención reservada para
  datos ficticios) y emails `@ejemplo-motor-contactos.test` — nunca puede
  confundirse con un contacto real si queda pegado sin querer.
- **No queda nada más por preparar de este lado** — el siguiente paso es
  100% del usuario. Cuando confirme el resultado (o pegue el log de la
  corrida), actualizar `PENDIENTES.md` § Fase 4 y este log con el
  resultado real.

---

## 2026-08-14 (cont. 3) — Pantalla "Importar" y MejoraWS integrado como módulo

- El usuario pidió, en mensajes sueltos dentro de la misma ronda: (1) un
  botón que loguee/conecte solo a Google Contacts e importe, (2) una
  pantalla de importación con "importar de carpeta" (recorre subcarpetas)
  e "importar archivo" (cualquier formato), y (3) incorporar todo el
  proyecto MejoraWS como un módulo usable desde adentro del sistema —
  todo esto bajo la directiva ya vigente de actuar sin esperar
  confirmación salvo bloqueo real de manos/login.
- **Botón de Google**: reusa `google_contacts_source.importar_google_contactos`
  ya existente (antes solo accesible por CLI) — con una cuenta ya
  autorizada (caso normal, `pablo`/`sindy` ya tienen `token_*.json`
  vigente) conecta y trae los nuevos/modificados sin ninguna interacción
  humana. Solo si fuera una cuenta NUNCA antes autorizada abriría el
  navegador para pedir login — no aplica hoy, ambas cuentas reales ya
  están autorizadas desde 2026-08-12.
- **Importar carpeta/archivo — decisión de diseño clave**: se descartó
  `<input type="file" webkitdirectory>` del navegador porque el
  Flask corre en la MISMA máquina que el usuario — un input HTML normal
  solo da bytes/nombres relativos, nunca la ruta real en disco, así que
  habría forzado a subir todo por HTTP en vez de leerlo directo del
  filesystem (mucho más lento e innecesario para un caso 100% local). En
  cambio, `file_dialogs.py` invoca `powershell.exe` con
  `System.Windows.Forms.FolderBrowserDialog`/`OpenFileDialog` — diálogo
  nativo de Windows, cero dependencias nuevas (mismo criterio que
  `token_crypto.py` con DPAPI: `ctypes`/`.NET` del sistema en vez de sumar
  una librería). Devuelve la ruta real; el backend la camina/lee
  directo.
- **`ingest.py` refactorizado, no duplicado**: `extraer_todo()` ahora
  acepta `raiz` (carpeta arbitraria en vez de la `carpeta_raiz`
  configurada) y `todas_las_extensiones` (ignora el allowlist de
  `config.yaml`, usa cualquier extractor registrado — a propósito: si el
  usuario eligió esa carpeta a mano, no tiene sentido limitarlo a los
  formatos habilitados por default para la corrida automática). Nueva
  `extraer_archivo()` para un solo archivo. Ambas comparten
  `_procesar_un_archivo()` (antes era código inline dentro del loop de
  `extraer_todo`) — mismo criterio incremental por hash que ya tenía el
  flujo normal, sin reimplementar nada.
- **MejoraWS — decisión de arquitectura, la más importante de esta
  ronda**: NO se reimplementó el envío de WhatsApp/Baileys dentro de
  motor-contactos. Motivos: (1) son dos stacks completamente distintos
  (Python/Flask vs Node/Electron/Baileys), fusionarlos de verdad sería
  una reescritura, no una integración; (2) la automatización de WhatsApp
  ya tiene riesgo real y documentado de ban de cuenta si se hace mal
  (ver `MejoraWS/README.md` — delay random y tope diario a propósito);
  MejoraWS ya tiene esa lógica resuelta y afinada, duplicarla sería
  repetir trabajo ya hecho con MÁS superficie de riesgo, no menos. En
  cambio, "módulo integrado" se interpretó como: accesible y lanzable
  desde adentro del panel de motor-contactos, sin salir a buscarlo al
  Explorador — nueva pestaña "WhatsApp (MejoraWS)" con el flujo completo
  (exportar CSV → botón "Abrir MejoraWS" → importar ahí → configurar y
  mandar, todo eso último dentro de MejoraWS) y `mejoraws_launcher.py`
  (`subprocess.Popen` + `cmd /c start`, sin bloquear — a diferencia de
  las demás acciones del panel, esto abre una app de escritorio de larga
  duración, no tiene sentido esperar a que termine). Ruta configurable
  (`config.yaml` → `mejoraws.ruta`, nueva `MejoraWsConfig`), default
  apunta a donde vive hoy (`C:\Github\Herramientas\MejoraWS`).
- **221 tests en verde** (201 → 221). Verificado en vivo con el Browser
  pane contra un backend de prueba en un puerto aparte (5051, no el 5000
  real) para no interferir con una instancia real que el usuario pudiera
  tener abierta — se detectó de hecho un proceso `MotorContactos.exe`
  corriendo desde antes (probablemente el usuario probando el acceso
  directo del Escritorio creado esta sesión), y se lo dejó intacto a
  propósito. Ambas pestañas nuevas renderizan bien, sin errores de
  consola propios (el único error visto fue un `ERR_CONNECTION_REFUSED`
  residual de mi propio backend de prueba reiniciándose entre dos rondas
  de verificación, no del producto).
- **No probado con clic real**: "Abrir MejoraWS" (abriría una app de
  Electron real) y los diálogos nativos de carpeta/archivo (requieren
  interacción humana con una ventana de Windows) — ambos cubiertos por
  tests con mocks, el flujo de punta a punta con clic real queda para
  que el usuario lo pruebe.
- Se corrigió al pasar un error propio de tooling: un `Select-Object
  -First 40` sobre la salida en vivo de `handoff.ps1` cortó el pipeline
  de PowerShell a mitad del build de PyInstaller en una ronda anterior de
  esta misma sesión (ver entrada anterior) — no se repitió acá, todas las
  corridas de `handoff.ps1`/tests de esta ronda se hicieron sin truncar
  la salida.

---

## 2026-08-15 — raw_records se duplicó x2 (investigado, NO era bug de código) + reset completo de datos por pedido explícito

- El usuario reportó "varios errores" sin detalle inicial; al pedir
  precisión dijo "no pasó nada al hacer clic". Se reprodujo contra el
  `.exe` real (Browser pane apuntando a `http://127.0.0.1:5000`, el mismo
  puerto que usa la ventana nativa) en vez de asumir: el clic en "Abrir
  MejoraWS" SÍ disparaba el POST, SÍ volvía 200 OK, y SÍ mostraba el
  mensaje en pantalla — ese botón funcionaba bien. Pero `/api/stats`
  mostró **raw_records: 72.207** en vez de los 36.103 esperados —
  exactamente el doble.
- **Investigación (antes de tocar nada)**: se confirmó que TODO el
  crecimiento fue de hoy (`creado_en` = 2026-08-15, distinto de los
  36.103 originales de 2026-08-12). De los 36.103 pares
  `google:<cuenta>:<resourceName>` con 2 filas, **36.099 tenían
  `raw_json` byte-a-byte idéntico** entre la fila vieja y la nueva, y
  **4 tenían contenido genuinamente distinto** (ej. un teléfono ganó el
  prefijo "+"). `normalized_records`/`contactos_finales` NO habían
  cambiado — el pipeline nunca llegó a normalizar/deduplicar estas filas
  nuevas, así que la lista maestra/vista de contactos nunca estuvo
  afectada.
- **Primer intento de fix, INCORRECTO — revertido**: se asumió que
  cualquier duplicado de `(source_file, source_row)` era por definición
  un bug, y se agregó un índice `UNIQUE` + `ON CONFLICT ... DO UPDATE`
  en `staging_db.py`/`ingest.py`/`google_contacts_source.py`. Al correr
  la suite completa, **4 tests fallaron**, y revelaron que el supuesto
  era falso: `test_google_contacts_source.py::
  test_importar_google_contactos_reimporta_si_cambio_el_etag` verifica
  EXPLÍCITAMENTE que un cambio de etag debe AGREGAR una fila nueva, no
  pisar la vieja — `raw_records` es append-only/inmutable a propósito
  (documentado en el propio docstring de `staging_db.py`: "Nada acá
  borra ni edita raw_records"). Y `test_dedup_blocking.py` inserta
  varias filas con el mismo `source_file`/`source_row` a propósito (usa
  esos campos como placeholder, no como clave única) para poder generar
  candidatos de dedup en los tests. **Se revirtieron los tres archivos a
  su estado exacto de antes** (`git diff` vacío) — commitear un fix
  sobre un supuesto falso, sin haber corrido los tests primero, hubiera
  sido peor que no arreglar nada.
- **Explicación real, sin cambio de código necesario**: `_ya_procesado()`
  compara el etag ACTUAL que devuelve la People API contra el
  `hash_sha256` guardado en `fuentes_procesadas` — si no coinciden,
  re-importa (por diseño, para no perderse cambios reales). El etag de
  Google no es puramente un hash del contenido que nosotros mapeamos
  (nombre/teléfono/email/etc.) — puede rotar por metadata interna de
  Google (sync tokens, campos que no extraemos, reindexados del lado de
  Google) sin que el contenido visible cambie. Que ~36.099 contactos
  hayan rotado de etag el mismo día, en las dos cuentas, con el
  `raw_json` resultante idéntico en la enorme mayoría, es consistente
  con una rotación de etags del lado de Google (no un bug de esta
  sesión) — el propio hecho de que exactamente 4 SÍ mostraran contenido
  distinto confirma que el mecanismo de comparación funciona
  correctamente (si estuviera roto, no habría manera de distinguir esos
  4 de los otros 36.099). **No se tocó nada de código para esto** — el
  diseño ya tolera este escenario: el siguiente `normalizar`+`deduplicar`
  hubiera colapsado las filas repetidas al mismo cluster por
  teléfono/email igual que siempre, sin inflar el conteo final de
  contactos. Queda documentado acá para que la próxima vez que
  `raw_records` crezca de golpe sin una razón obvia, no se asuma pánico
  de entrada — primero verificar si el contenido resultante es
  realmente distinto o es ruido de etag.
- **Reset completo de datos, pedido explícito y aparte del usuario**: no
  relacionado con el hallazgo de arriba — el usuario pidió borrar TODOS
  los datos ("ahora nos enfocamos en la interfaz y en que funcione,
  después trabajaremos con los datos en la parte de tester"). Antes de
  borrar: `git commit` en el repo local de `Data/` con el estado tal
  cual estaba (con las 36.104 filas de hoy incluidas, por las dudas) —
  además ya existía un backup limpio previo del 2026-08-13_2054, así que
  el estado de antes del reset queda recuperable en dos puntos
  distintos si alguna vez hiciera falta. Se borró
  `Data/Salida/staging.sqlite` (se recrea vacío solo al conectar,
  `staging_db.conectar()` corre `CREATE TABLE IF NOT EXISTS`) y los
  exports generados (`lista-maestra.xlsx`, `contactos-whatsapp.csv`,
  reflejaban datos viejos). `Data/Crudos/` ya estaba vacío de antes (el
  proyecto usa Google Contacts en vivo, no CSV manuales, desde
  2026-08-11). Verificado: las 8 tablas en 0 filas tras reconectar con
  la config real. Los tokens OAuth (`token_pablo.json`/`token_sindy.
  json`) NO se tocaron — no son "datos de contactos", son credenciales,
  y no se pidió revocar el acceso.
- **221 tests en verde** (sin cambios netos de código en esta entrada).

---

## 2026-08-15 (cont.) — Meta-auditoría + dos propuestas de rediseño de Lovable: qué se aplicó y qué se descartó

- El usuario pidió una "meta-auditoría": criticar la auditoría .docx del
  2026-08-14 (verificar qué estaba bien sustentado, qué no, y qué le
  faltaba) más un prompt de mejoras enfocado en riesgos/seguridad para
  pegar en otro agente — entregado en el chat, explícitamente sin cambios
  de código en este proyecto. Hallazgo más serio de esa revisión, no
  mencionado en la auditoría original: `llm_judge.py:112-114`
  (`_consultar`) manda nombre/apellido/organización/TODOS los teléfonos/
  TODOS los emails de ambos contactos, tal cual, a Groq y a cualquiera de
  los 13 modelos gratis rotativos de OpenRouter además de Anthropic, en
  cada caso de dedup "zona gris" — datos personales reales de terceros
  saliendo a proveedores externos sin ningún control de minimización.
  Verificado leyendo `merge_engine.py:373-380` (`_a_dict`, el payload
  exacto). También: `Sync.gs:168/180` loguea `JSON.stringify(persona)`
  completo en modo DRY_RUN (queda en el log de ejecuciones de Google Apps
  Script). Ninguno de los dos hallazgos estaba en el informe original —
  quedaron en el prompt de mejoras entregado, no implementados todavía
  (el usuario no pidió ejecutar el prompt, solo tenerlo listo).
- El usuario pegó DOS propuestas de rediseño de interfaz generadas por
  "Lovable" (una acotada centrada en debilidades puntuales, otra un
  "rediseño integral" completo: tema oscuro por default, command palette
  Ctrl+K, layout maestro-detalle reemplazando la tabla+modal actual,
  rail de iconos en vez de sidebar, cola de revisión rediseñada
  par-por-par con atajos J/K/F/S/Z) con la instrucción explícita de que
  la decisión final es de esta sesión, Lovable es solo una opinión.
- **Se rechazó el rediseño integral completo**, con criterio explícito:
  (1) es una reescritura de días, no algo para meter en una sesión sobre
  una UI que ya funciona y está testeada con 221 tests en verde; (2) gran
  parte de las "debilidades declaradas" que ambos documentos citan
  (popovers fuera del viewport, paleta de avatar genérica) YA se habían
  resuelto en la ronda del 2026-08-14 de esta misma sesión — los
  documentos describían un estado ya superado, otra vez el problema de
  que un análisis estático envejece mal si no se versiona; (3) la
  propuesta de cola de revisión par-a-par con atajos J/K asume una
  arquitectura distinta a la real (`ReviewQueue.tsx`/`reviewer_app.py`
  aprueban/rechazan LOTES por patrón, no pares individuales uno por uno
  — implementarlo tal cual habría exigido rediseñar el flujo de revisión
  entero, no solo agregar atajos).
- **Se extrajeron y aplicaron 3 mejoras acotadas, de valor real,
  verificadas contra el código antes de tocar nada**:
  1. *Badges de calidad del dato*: `phone_normalizer.py`/
     `email_normalizer.py` ya calculaban flags (`movil-asumido`,
     `incompleto`, `corregido`, `revisar`) guardados en
     `normalized_records.flags` desde hace tiempo, pero `export.py`
     nunca los propagaba a `_materializar_clusters()` — el dato existía
     en la base, la interfaz nunca lo mostró. Se agregó la unión de
     flags de todos los `normalized_records` que componen cada cluster,
     más un `editado_manualmente` (si el cluster tiene fila en
     `ediciones_manuales`). Se muestran como puntos de color con
     tooltip junto al nombre en la tabla.
  2. *Pantalla Anomalías*: `anomalias.py` (teléfono compartido por +5
     contactos finales) existía y corría por CLI/aviso mensual desde una
     sesión anterior, pero nunca tuvo pantalla propia — mismo patrón que
     el punto anterior, dato calculado y nunca mostrado. Nuevo
     `/api/anomalias` + pantalla dedicada.
  3. *Tipografía monoespaciada* para teléfono/email en la tabla
     (legibilidad de dígitos alineados) — cambio de estilo puntual, sin
     tocar layout.
- **Verificado en vivo antes de commitear**: backend de prueba (puerto
  aparte) con datos sintéticos armados a propósito para disparar cada
  flag (`movil-asumido` con un teléfono de 10 dígitos sin pista,
  `incompleto`+`corregido` con uno de 7 dígitos) y una anomalía real (6
  contactos con el mismo número) — Browser pane confirmó los 3 puntos de
  color correctos con sus tooltips, el punto verde de "editado
  manualmente", y la pantalla de Anomalías mostrando el teléfono y los 6
  nombres. Sin errores de consola.
- **No se tocó el panel HTML clásico** para esto — Anomalías es una
  pantalla nueva que tampoco existía ahí, y agregarla hubiera requerido
  construir de cero una vista de datos que ese panel no tiene (es
  deliberadamente el "bote de salvamento", no una segunda app completa).
  Documentado como decisión, no como olvido.
- **224 tests en verde** (221 → 224: 2 en `test_pipeline_integration.py`
  para flags/editado_manualmente, 1 en `test_api.py` para el endpoint de
  anomalías — la lógica de detección de anomalías en sí ya estaba
  cubierta en `test_anomalias.py` de una sesión anterior).

---
