# motor-contactos — Especificación técnica (referencia única)

Este documento es la fuente de verdad técnica del proyecto, pensada para que
cualquier cuenta de Claude Code que retome el trabajo (ver
`PROMPT_CONTINUACION.md`) entienda la arquitectura sin tener que leer
transcripciones de sesiones viejas. Se actualiza cuando cambia algo
estructural, no en cada sesión — el detalle día a día vive en
`DECISIONES.md` y en los reportes de `scripts/handoff.ps1`.

## Qué es

Motor de consolidación de contactos personal y privado (de Pablo y Sindy):
lee exports crudos y desparramados (CSV/Excel/VCF/JSON/HTML/Word/PDF/
capturas/texto libre) de múltiples cuentas de Gmail, los normaliza
(teléfono/email), deduplica con reglas + IA, y produce una lista maestra
única exportable a Excel y sincronizable con Google Contacts.

**No es parte del negocio de Mejora Continua ni de la SPA `MejoraContactos`**
que vive en la raíz de este mismo repositorio — son dos proyectos separados
a propósito. `motor-contactos/` y `Data/` (donde viven los CSV reales) tienen
sus propios repos git **locales, sin remoto** (ver "Versionado" abajo);
`Data/` además queda excluida por completo del repo raíz vía `.gitignore` —
nunca se sube a GitHub.

## Principio rector

Privacidad primero: los datos nunca salen de la máquina del usuario. Nada se
fusiona destructivamente — toda fusión es reversible. Autonomía de IA real
pero con red de seguridad: tres bandas de confianza, nunca acción humana
uno-por-uno.

## Arquitectura de datos (`staging.sqlite`)

`Data/Salida/staging.sqlite` es la fuente de verdad incremental (no un
archivo intermedio descartable):

| Tabla | Rol |
|---|---|
| `fuentes_procesadas` | hash+mtime por archivo crudo — no reprocesa lo ya visto |
| `raw_records` | un registro por contacto crudo tal cual salió del extractor. Inmutable. |
| `normalized_records` | salida de los normalizadores aplicada a cada `raw_record` |
| `telefono_index` / `email_index` | índices para blocking de dedup |
| `clusters` | `raw_record_id → cluster_id` + `decidido_por` + `confianza` + `corrida_id`. El "contacto maestro" es una vista calculada, nada se fusiona físicamente |
| `decisiones_log` | auditoría **append-only** de cada decisión (nunca se borra, ni al deshacer) |
| `aprendizaje_umbrales` | tasa de aceptación humana por patrón, ajusta scoring con el tiempo |
| `ediciones_manuales` | correcciones manuales por `cluster_id` (pisan el valor calculado, nunca tocan `raw_records`) |
| `busqueda_fts` | FTS5 para el buscador |

**Importante**: `deduplicar_todo()` (`dedup/merge_engine.py`) recalcula TODOS
los clusters desde cero en cada corrida — no hay modo incremental para dedup
(sí lo hay para extracción). Si se corre `deduplicar` después de que el
usuario ya aprobó/rechazó casos a mano vía `/decidir`, esas decisiones se
pierden en la siguiente corrida completa. Orden correcto: cargar API keys →
correr LLM-judge una vez → recién ahí arranca la revisión manual.

## Fuente de datos: Google Contacts en vivo (no CSV manuales)

**Decisión del usuario (2026-08-11)**: en vez de mantener exports CSV a
mano en `Data/Crudos/`, el sistema se conecta directo a Google Contacts vía
la People API (`src/motor/google_contacts_source.py`). Cada cuenta de
Google (`pablo`, `sindy`, configurables en `config.yaml` → `google.
cuentas`) se autoriza una vez con `motor importar-google <cuenta>` —
requiere login del usuario en el navegador (lo único que Claude no puede
hacer), después queda un `token_<cuenta>.json` local que se refresca solo.
Ver `GOOGLE_SETUP.md` para el setup completo (Google Cloud Console +
`credentials.json`, un solo archivo para todas las cuentas).

`importar_google_contactos()` llena `raw_records` igual que cualquier
extractor de `extractors/` — reusa la tabla `fuentes_procesadas` con una
ruta sintética `google:<cuenta>:<resourceName>` y el `etag` de Google como
"hash", así una corrida recurrente solo trae contactos nuevos o
modificados. Los extractores de archivo (`extractors/`) siguen existiendo
para el día que haga falta importar algo que no vive en Google Contacts.

## Pipeline (CLI: `python -m motor.cli <comando>`)

`importar-google <cuenta> → normalizar → deduplicar → exportar` (el
comando `run` sigue siendo `extraer + normalizar + deduplicar + exportar`
por compatibilidad con los extractores de archivo — **no** incluye
`importar-google`, que se corre aparte por cuenta). Comandos de revisión:
`panel` (abre navegador) / `revisar` (no abre navegador) levantan el mismo
Flask app en `:5000` (puerto en `config.yaml` → `revisor.puerto`).
`deshacer <cluster_id>` / `deshacer-ultima-corrida` revierten fusiones.

## Tres bandas de confianza (dedup)

1. **Score ≥ `umbral_fusion_automatica`** (0.80 hoy) → fusiona sola, logueada, reversible.
2. **Score ≤ `umbral_no_fusionar`** (0.55 hoy) → no fusiona, sin preguntar.
3. **Banda media** → `llm_judge.py`: Groq primero (gratis), si reporta baja confianza escala a Anthropic (pago, mejor calidad). Si ninguno resuelve con confianza suficiente → cola de revisión humana en lote (`/revisar`, agrupada por patrón).

Las API keys (`GROQ_API_KEY`, `ANTHROPIC_API_KEY`) se leen de
`motor-contactos/.env` (nunca de `config.yaml`, nunca del chat) —
`cli.py:main()` llama `load_dotenv()` al arrancar. Si falta una key, el
proveedor correspondiente simplemente no responde (falla silenciosa) y el
caso cae en revisión pendiente — el pipeline nunca se rompe por falta de
keys.

## Fases del proyecto

- **Fase 1 — MVP estructurado** (✅ construida): extractores CSV/Excel/VCF/
  JSON, normalizadores de teléfono/email, dedup 3 bandas, panel web,
  export a `.xlsx`.
- **Fase 2 — semi-estructurado** (✅ construida, promovida antes de lo
  planeado): extractores HTML, Word (docx).
- **Fase 3 — experimental** (✅ construida): PDF, OCR de imágenes (requiere
  el binario Tesseract-OCR instalado aparte en Windows — confirmado NO
  instalado en esta máquina, el extractor lo tolera sin romper), texto
  libre (WhatsApp/notas). Todo lo extraído acá entra con
  `confianza_extraccion="baja"` — el dedup nunca lo auto-fusiona contra un
  contacto verificado sin pasar por revisión, sin importar el score.
- **Fase 4 — sync a Google Contacts** (✅ código migrado, ⏳ sin probar en
  vivo): `google-apps-script/Sync.gs`, corre **una copia por cuenta**
  (Pablo, Sindy), cada una con su login. Usa el servicio avanzado **People
  API** de Apps Script — la versión anterior usaba `ContactsApp`, dado de
  baja por Google el 31/01/2025, ya no funciona. Requiere habilitar el
  servicio "People API" en el editor de Apps Script antes de correr (ver
  `google-apps-script/README.md`). Reintenta con backoff ante error 429.
- **UI nueva (Fase 1 del plan "v2", en curso)**: `motor-contactos/ui/`
  (Vite + React + TS + Tailwind, paleta propia sin marca de Mejora
  Continua), habla con `src/motor/api.py` — una API JSON montada sobre el
  mismo Flask app y la misma conexión sqlite que el panel HTML clásico
  (`reviewer_app.py`), sin reemplazarlo. Backend en `:5000`, UI en `:5173`
  (Vite, dev server local del usuario — **no** el que administra un Browser
  pane de Claude Code, que corre en un sandbox de red aislado sin acceso
  real a la máquina).
- **Fase 5 — escaneo de directorios completos de la PC**: pospuesta a
  propósito, no arrancar sin conversación aparte (volumen/privacidad
  desconocidos).
- **Multi-usuario / producto**: diseñado (no construido) — ver
  `PROMPT_CONTINUACION.md` § "Decisiones ya tomadas" para el resumen; el
  detalle completo vive en el historial de `MejoraContactos.md` de la
  sesión donde se decidió (Opción A: local-first multi-workspace,
  recomendada; Opción B: SaaS hosteado, descartada por ahora porque rompe
  la promesa de privacidad).

## Estructura de archivos

```
motor-contactos/
├── config.yaml              # config editable (umbrales, rutas, LLM, cuentas de Google)
├── .env                     # API keys LLM (gitignored, el usuario lo completa)
├── credentials.json         # client OAuth de Google (gitignored, ver GOOGLE_SETUP.md)
├── token_<cuenta>.json       # token OAuth por cuenta (gitignored, se genera solo)
├── requirements.txt / pyproject.toml
├── src/motor/
│   ├── cli.py                # entrypoint
│   ├── config.py             # carga config.yaml a dataclasses
│   ├── staging_db.py         # esquema SQLite + migraciones
│   ├── google_contacts_source.py  # People API -> raw_records (fuente principal)
│   ├── ingest.py             # orquestador de extracción de ARCHIVOS (incremental, secundario)
│   ├── extractors/           # csv, excel, vcard, json, html, docx, pdf,
│   │                         # image_ocr, freetext + base/column_mapping
│   ├── phone_normalizer.py / email_normalizer.py
│   ├── text_cleaning.py      # limpieza heurística (nombre/cargo/empresa)
│   ├── tagging.py            # auto-etiquetado heurístico
│   ├── normalize_pipeline.py
│   ├── dedup/                # blocking, scoring, union_find, learning,
│   │                         # merge_engine
│   ├── llm_judge.py          # Groq→Anthropic escalonado
│   ├── export.py             # lista maestra .xlsx + ediciones manuales
│   ├── reviewer_app.py       # panel HTML clásico (Flask)
│   └── api.py                # API JSON para la UI nueva (Fase 1 v2)
├── tests/                     # fixtures SINTÉTICAS únicamente
├── ui/                        # UI nueva (Vite+React+TS), separada del panel HTML
├── google-apps-script/        # Fase 4, versionado (no son datos personales)
├── scripts/                   # setup_project.ps1, handoff.ps1
├── ESPECIFICACION.md          # este archivo
├── PENDIENTES.md              # tareas abiertas — se actualiza en cada sesión
├── PROMPT_CONTINUACION.md     # prompt para arrancar una cuenta nueva
├── DECISIONES.md              # log append-only de decisiones/hallazgos
└── handoffs/                  # reportes generados por handoff.ps1

Data/                          # HERMANO de motor-contactos/, NO adentro
├── Crudos/                    # exports crudos (pablo.csv, Sindy.csv, ...)
└── Salida/
    ├── staging.sqlite         # la base de verdad — NUNCA se borra a mano
    └── lista-maestra.xlsx     # export final
```

## Versionado (repos git locales, sin remoto)

Para que un borrado accidental (como el que ya pasó una vez) sea siempre
recuperable con `git checkout` en vez de depender de la Papelera de
Reciclaje de Windows, hay DOS repos git **puramente locales** (sin
`git remote`, nunca se pushean a ningún lado):

- **`motor-contactos/.git`** — versiona el código fuente (`src/`, `tests/`,
  `ui/` sin `node_modules`/`dist`, configs, docs de este mismo directorio).
  Es lo que lee `scripts/handoff.ps1` para armar el reporte de traspaso
  (`git log`, `git diff`).
- **`Data/.git`** — versiona los datos reales (`Crudos/`, `Salida/`,
  incluido `staging.sqlite` binario). Es pura red de seguridad — no se lee
  para reportes de código, solo existe para poder recuperar una versión
  anterior si algo vuelve a borrarse.

Ambos quedan excluidos en bloque del repo raíz `MejoraContactos/.gitignore`
(`Data/` y `motor-contactos/`) para que un `git add -A` en la raíz nunca
los toque ni los trate como submódulos.

`scripts/setup_project.ps1` los inicializa si no existen (idempotente).
Correr `git -C Data add -A && git -C Data commit -m "..."` después de
cualquier corrida real del pipeline es buena práctica hasta que esto se
automatice dentro del propio pipeline (no se hizo todavía — evaluar en una
fase posterior, no forma parte de este documento de spec).

## Comandos de referencia

```bash
cd motor-contactos
.venv/Scripts/python.exe -m pytest -q                       # suite completa
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli revisar # panel + API en :5000
cd ui && npm run dev                                          # UI nueva en :5173 (el usuario la corre en SU terminal)
```

## Reglas que no se negocian (dogma del proyecto)

- Nunca escribir ni borrar en `Data/Crudos/`.
- Nada se fusiona destructivamente — todo reversible vía `clusters` +
  `deshacer`/`deshacer-ultima-corrida`.
- Fixtures de test siempre sintéticas, nunca filas reales de pablo.csv/Sindy.csv.
- API keys solo en `.env`, nunca en `config.yaml` ni pegadas en el chat.
- Sin identidad de marca de Mejora Continua en nada de esto — es un
  proyecto privado, criterio de diseño propio.
- Autonomía de PM: Claude decide diseño/arquitectura/alcance sin encuestar;
  solo pregunta cuando el paso siguiente requiere manos/ojos/login humano
  (ver `PROMPT_CONTINUACION.md`).
