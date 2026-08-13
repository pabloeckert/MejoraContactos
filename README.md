# Motor de consolidación de contactos

Sistema local (Python) para limpiar, deduplicar y consolidar los contactos
reales de Pablo y Sindy en una lista maestra única, sincronizable con
Google Contacts.

Todo corre en esta PC. Nada se sube a ningún lado salvo las llamadas
directas a Google (People API, con permiso ya otorgado por cada cuenta) y
a los proveedores de IA usados para los casos dudosos de deduplicación.

**Este README no es la fuente de verdad del estado del proyecto — se
actualiza cuando hay tiempo, no en cada sesión.** Los documentos que SÍ se
mantienen al día en cada sesión de trabajo son:
- [`ESPECIFICACION.md`](ESPECIFICACION.md) — arquitectura completa y reglas
  que no se negocian.
- [`PENDIENTES.md`](PENDIENTES.md) — qué falta, qué está bloqueado, qué
  está pospuesto a propósito. Es lo primero a leer para saber "qué falta".
- [`DECISIONES.md`](DECISIONES.md) — log append-only de decisiones y
  hallazgos, con fecha y motivo.
- `handoffs/` — un reporte de traspaso por sesión (tests, commits, estado),
  el más reciente por orden de fecha es el más confiable.
- [`PROMPT_CONTINUACION.md`](PROMPT_CONTINUACION.md) — cómo retomar el
  proyecto en una cuenta de Claude nueva.

**Pivote importante (2026-08-11)**: el sistema dejó de depender de los
exports manuales `Data/Crudos/pablo.csv`/`Sindy.csv` (se borraron sin
querer recuperarlos) y ahora se conecta **directo a Google Contacts vía
People API** (`google_contacts_source.py` — ver `GOOGLE_SETUP.md`). Las
cifras y ejemplos de más abajo que mencionan "34.811 registros" o
`Data/Crudos/*.csv` corresponden a esa etapa anterior del proyecto y ya NO
reflejan el dataset real actual — quedan como documentación histórica de
cómo se construyó y probó cada pieza, no como estado vigente. Estado real
más reciente confirmado en base (2026-08-13): **36.103 raw_records**
(18.135 de Pablo + 17.968 de Sindy, importados directo de sus cuentas de
Google), **36.102 normalizados**, **8.590 contactos finales** tras
deduplicar, **649 casos en cola de revisión** pendientes de aprobar a mano
en `/revisar`.

**Segunda interfaz en construcción**: además del panel HTML clásico
(`reviewer_app.py`, descripto abajo), hay una **UI nueva en React**
(`ui/`, Vite+React+TS+Tailwind) que habla con `src/motor/api.py` — una API
JSON montada sobre el mismo Flask app, sin reemplazar el panel clásico.
Ver `ESPECIFICACION.md` para el detalle de qué tiene cada una.

## Estado actual (histórico — ver aviso arriba)

**Fase 1 (MVP) construida y validada de punta a punta contra datos reales**
(`Data/Crudos/pablo.csv` + `Data/Crudos/Sindy.csv`, 34.811 registros):

- Normalización de teléfonos (`phone_normalizer.py`) y emails
  (`email_normalizer.py`), 65 tests en verde.
- Extractores estructurados (confianza alta): CSV/TSV, Excel/ODS, VCF,
  JSON, HTML y **Word/.docx** — tablas con detección de encabezado y mapeo
  de columnas ES/EN.
- Extractores experimentales de Fase 3 (confianza baja, siempre van a
  revisión antes de fusionar contra un contacto ya verificado — ver
  salvaguarda de `dedup/scoring.py`): **PDF** (`pdf_extractor.py`, tabla si
  hay, texto libre si no), **OCR de imágenes/capturas**
  (`image_ocr_extractor.py`, requiere el binario de Tesseract-OCR
  instalado aparte — no lo tiene esta PC todavía, el extractor lo detecta
  solo y no rompe nada mientras tanto), **texto libre**
  (`freetext_extractor.py`, heurística de regex sobre `.txt`/`.log`/`.md`,
  reusada por PDF y OCR). Un extractor que falla no frena el resto de la
  carpeta (`ingest.py` los corre con try/except individual).
  115 tests en verde en total.
- `staging.sqlite` (`src/motor/staging_db.py`) como fuente de verdad
  incremental: `motor extraer` no reprocesa archivos que no cambiaron (hash).
- Deduplicación (`src/motor/dedup/`): blocking por teléfono/email/nombre
  fonético, scoring por señales ponderadas, union-find para clusters,
  aprendizaje de umbrales por patrón. Umbral inicial "agresivo" (mismo
  teléfono/email exacto fusiona solo) **con una salvaguarda**: si ambos
  contactos traen nombre completo y son claramente distintos, no se
  fusionan en silencio — van a revisión, para no mezclar a dos personas que
  comparten un teléfono fijo de familia/oficina (encontrado corriendo
  contra los datos reales: sin la salvaguarda, 3.439 pares de personas
  distintas se fusionaban solos; con ella, bajó a 837 casos genuinamente
  ambiguos).
- Juez LLM escalonado (`llm_judge.py`): Groq primero, escala a Anthropic si
  hace falta, para los casos en la banda de confianza media. Si no hay API
  key configurada, esos casos simplemente quedan en la cola de revisión
  (nunca rompe el pipeline).
- **Limpieza de texto** (`text_cleaning.py`): nombre/apellido/cargo/empresa
  llegan del origen con basura real (teléfonos y emails guardados como
  nombre, comillas, honoríficos, cargos con 3 roles concatenados, filas
  plantilla de Google/Mailchimp) — se limpian, se clasifican (¿es nombre
  de persona, de empresa, o un cargo que se coló en el campo equivocado?)
  y se ponen en Title Case antes de llegar a `normalized_records`.
- Panel web (`reviewer_app.py`, Flask): dashboard en `/` con botones para
  correr cada paso del pipeline y ver el estado (sin memorizar comandos de
  CLI), cola de revisión en lote en `/revisar` (patrón de señales,
  dedup/scoring.py), y **buscador + editor individual** en `/buscar` →
  `/editar/<cluster_id>` (Nombre, Apellido, Cargo, Empresa, Tag, Domicilio,
  Ciudad, Provincia, País, Nota de referencia). `python -m motor.cli panel`
  lo abre solo en el navegador. **Doble clic en `Iniciar Panel.bat`** hace
  lo mismo sin abrir ninguna terminal (`Instalar (primera vez).bat` arma
  el entorno virtual la primera vez).
- **Auto-etiquetado** (`tagging.py`): el campo Tag se completa solo al
  normalizar (familiar/cliente/proveedor/laboral/personal, por palabras
  clave en Cargo/Empresa/Nota). Es un punto de partida, no la última
  palabra — se corrige a mano en `/editar/<cluster_id>`, y esa corrección
  manual siempre gana sobre lo que calculó la heurística (tabla
  `ediciones_manuales`, aplicada como override en el export — nunca toca
  `raw_records` ni `normalized_records`).
- Export a `Data/Salida/lista-maestra.xlsx` (`export.py`, vía `openpyxl` —
  no CSV, para evitar el problema de codificación de acentos al abrir un
  CSV directo en Excel) con esquema fijado en la encuesta de cierre:
  nombre, apellido, cargo, empresa, whatsapp y teléfono fijo por separado,
  tag, domicilio/ciudad/provincia/país (opcionales), nota de referencia —
  **un valor por celda**: si un contacto tiene más de un WhatsApp/teléfono
  fijo/email, se generan varias filas en vez de juntarlos con ";". Sin
  columna "fuentes" (no estaba pedida). Nada se fusiona destructivamente:
  `python -m motor.cli deshacer <cluster_id>` revierte una fusión puntual,
  `python -m motor.cli deshacer-ultima-corrida` revierte TODA la última
  corrida de una sola vez (sin ir cluster por cluster).
- CLI (`cli.py`): `panel | extraer | normalizar | deduplicar | exportar |
  run | revisar | deshacer | deshacer-ultima-corrida`.

**Resultado de la corrida real más reciente**: 34.811 registros crudos →
10.197 filas en la lista maestra (una fila por WhatsApp/fijo/email — más
filas que "contactos únicos" porque varios tienen más de un número), con
4.037 filas con cargo y 3.906 con empresa poblados correctamente tras la
limpieza. Verificado a mano: 0 caracteres especiales (comillas/apóstrofes),
0 separadores de export (":::") filtrados, 0 celdas con valores múltiples
juntos, 1 caso residual de nombre sospechoso (de 572 originales) que quedó
sin resolver por ser un patrón demasiado ambiguo para un regex.

Distribución del auto-etiquetado sobre esas 10.197 filas: 7.008 "personal"
(default, sin cargo/empresa/palabra clave detectada), 3.126 "laboral", 41
"familiar", 18 "proveedor", 4 "cliente" — la heurística por palabras clave
solo tiene señal fuerte cuando el campo Nota de referencia trae algo
explícito; para la mayoría de los 34.811 contactos reales ese campo viene
vacío, así que la mayoría cae en "personal" hasta que se corrija a mano
desde `/editar`.

**Fases 1, 2, 3 y 4 construidas.** Fase 4 (`google-apps-script/Sync.gs` +
`google-apps-script/README.md`): sincroniza la lista maestra con Google
Contacts vía Apps Script (`ContactsApp`, sin configuración extra en Google
Cloud), idempotente (actualiza en vez de duplicar). El deploy en sí — crear
el Sheet compartido, pegar el script en cada cuenta, autorizar — son pasos
que solo Pablo/Sindy pueden hacer con su propio login de Google; el panel
web (sección "Fase 4") tiene los pasos resumidos.

**Auto-etiquetado, edición en línea, aviso mensual y lanzador de doble
clic — construidos.** Auto-etiquetado (`tagging.py`) completa el campo Tag
solo al normalizar; edición en línea vive en `/buscar` → `/editar/<id>`
del panel web (tabla `ediciones_manuales`, override no destructivo sobre
el export); el aviso mensual es una tarea programada real (día 30 de cada
mes, 9:00) que corre el pipeline y avisa el resumen — administrable desde
la sección "Scheduled" de Claude Code, no vive en este repo porque no es
código Python; `Iniciar Panel.bat` / `Instalar (primera vez).bat` en la
raíz de `motor-contactos/` permiten usar todo esto sin abrir una terminal.

Todavía NO construido: Fase 5 (escaneo de directorios de la PC, pospuesta
a propósito — falta que Pablo defina qué carpetas incluir/excluir antes de
tocar el filesystem fuera de `Data/Crudos`) y modo híbrido de revisión
(lote + individual, hoy solo hay lote en `/revisar` e individual en
`/editar`, no un tercer modo combinado) — ver
`C:\Users\Pablo\.claude\plans\lee-claude-md-y-dame-immutable-pony.md`
secciones "Spec cerrada v2" y "ACTUALIZACIÓN 2/3/4/5" para el detalle completo.

**Para que Fase 3 extraiga algo de imágenes/capturas**: instalar
Tesseract-OCR (el binario, no alcanza con `pip install`) desde
https://github.com/UB-Mannheim/tesseract/wiki — si el instalador no lo deja
en el PATH de Windows, indicar la ruta en `config.yaml` (`ocr.tesseract_cmd`,
ejemplo comentado ahí mismo).

## Primera vez

**Sin terminal**: doble clic en `Instalar (primera vez).bat` (una sola vez) y
después `Iniciar Panel.bat` (cada vez que se quiera usar) — ambos en la raíz
de `motor-contactos/`.

**Por línea de comandos**, si se prefiere:

```bash
cd motor-contactos
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # PowerShell/cmd
# .venv/Scripts/python.exe -m pip install -r requirements.txt   # si el activate no toma
```

## Correr los tests

```bash
cd motor-contactos
.venv/Scripts/python.exe -m pytest -v
```

## Uso del normalizador de teléfonos (por ahora, standalone)

```python
from motor.config import cargar_config
from motor.phone_normalizer import normalizar_campo_telefono

config = cargar_config("config.yaml")
resultados = normalizar_campo_telefono("0 3743 15-504517", config.telefono)
for r in resultados:
    print(r.e164, r.pais, r.flags, r.valido)
# +5493743504517 AR [] True
```

## Cómo funciona la normalización de teléfonos

- **Argentina**: saca el `0` de larga distancia y ubica el `15` de móvil
  usando la tabla de códigos de área (`src/motor/area_codes_ar.py` — 1
  código de 2 dígitos, ~35 de 3 dígitos para las ciudades grandes, el resto
  se asume de 4 dígitos, que es el comportamiento correcto por default).
  Formato de salida: `+549` + 10 dígitos (estilo WhatsApp) para celulares,
  `+54` + 10 dígitos para fijos.
- **Ambigüedad celular/fijo**: si no hay `15`/`9` ni pista de etiqueta de
  columna (`Home`, `Mobile`, etc.), se usa `telefono.asumir_movil_por_defecto`
  de `config.yaml` y se deja la bandera `movil-asumido` — nunca se decide
  en silencio.
- **Números cortos** (6 a 8 dígitos): se completan con
  `telefono.codigo_area_default` (376, Posadas, configurable) y quedan
  marcados `incompleto` + `corregido`.
- **Extranjeros**: se valida con la librería `phonenumbers` (soporta
  prácticamente cualquier país). Sin un `+` explícito se prioriza SIEMPRE
  la interpretación doméstica argentina cuando el número encaja en algún
  patrón conocido (10 dígitos, `9`+10, `54`+10/11, 6-8 dígitos) — un bloque
  de dígitos "pelado" a veces coincide por casualidad con el plan de
  numeración de otro país (nos pasó con Hungría y Bélgica en los datos
  reales), y en esta base la inmensa mayoría de los contactos son
  argentinos.
- **Números pegados**: si un campo trae 20+ dígitos múltiplo de 10 sin
  separadores, se parte en bloques de 10.
- **Múltiples números por campo**: separados por `;`, `,`, `/`, `|`, ` y `,
  o `:::` (así es como los exports reales de Google Contacts unen valores
  duplicados dentro de un mismo campo — se detectó corriendo contra
  `pablo.csv`/`Sindy.csv` reales, no estaba en el pedido original).
  Los resultados con el mismo E.164 final se deduplican dentro del campo.
- **Corrupción de Excel**: campos numéricos largos que Excel/Sheets
  convirtió a notación científica (`3,76155E+11`) se detectan y se mandan
  directo a `revisar` — esos dígitos truncados son irrecuperables, nunca se
  "completan" con el código de área default (eso fabricaría un número
  falso).

### Limitación conocida

Un número con `+` explícito pero con el `54` de Argentina faltante por
error de tipeo (ej. `+93764223199` en vez de `+549...`) puede coincidir con
el plan de numeración real de otro país (en ese caso, Afganistán) y
clasificarse como extranjero. Es poco frecuente (se vio 1 vez en ~40.000
números reales) y queda visible en la columna de país detectado de
`lista-maestra.csv` para corregir a simple vista — no vale la pena una
heurística extra para un caso tan raro.

## Config

Ver `config.yaml` para umbrales de dedup, pesos de scoring y config de LLM.
Las API keys (`GROQ_API_KEY`, `ANTHROPIC_API_KEY`) van en `motor-contactos/.env`
(copiar de `.env.example`), nunca en `config.yaml` ni en el chat.

## Uso

**Con panel web (recomendado)** — abre el navegador solo, sin memorizar comandos:

Doble clic en `Iniciar Panel.bat`, o por línea de comandos:

```bash
cd motor-contactos
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli panel
```

Dentro del panel: "Panel" corre el pipeline paso a paso o de una vez,
"Revisión pendiente" es la cola de aprobación en lote para los casos
dudosos, y "Buscar / editar contacto" permite buscar a alguien por
nombre/teléfono/email y corregir a mano Nombre/Apellido/Cargo/Empresa/Tag/
dirección/nota — esa corrección siempre pisa lo que calculó la limpieza
automática para ese contacto puntual.

**Por línea de comandos:**

```bash
cd motor-contactos
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli run                       # extraer + normalizar + deduplicar + exportar
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli revisar                   # cola de revisión (Flask, localhost:5000, sin abrir navegador solo)
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli deshacer <cluster_id>
PYTHONPATH=src .venv/Scripts/python.exe -m motor.cli deshacer-ultima-corrida
```
