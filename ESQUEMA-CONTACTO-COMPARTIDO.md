# Esquema de contacto compartido

**Última actualización:** 2026-09-16 — extensión de doble vía (ver abajo). El resto del documento (a partir de "Esquema de contacto compartido — diagnóstico") queda como historial: es el diagnóstico original, antes de resolver nada, y ya no describe el estado actual del código en los puntos que se resolvieron acá.

## Actualización 2026-09-16 — sincronización de doble vía con MejoraCRM

`contactos-api` ahora acepta también POST (crear/actualizar un contacto), gateado por un permiso `puede_escribir` nuevo por API key — hasta acá era solo lectura. `cluster_id` pasa a ser opcional en `contactos_finales` (un contacto creado desde MejoraCRM no tiene uno hasta que, eventualmente, pase por el pipeline de dedup local). Nueva tabla `contactos_sync_log` para auditar cada push/pull. El diseño completo, el registro de riesgos, y el checklist de activación viven en `INFORME-SINCRONIZACION-CONTACTOS.md`, en el repo **MejoraCRM** (no acá) — es la mitad de una integración entre dos repos, tiene más sentido como un solo documento del lado que orquesta la sincronización. Igual que el resto de esta sesión: código escrito y verificado (type-check + lint con Deno real), **nada corrido contra Supabase real, nada commiteado todavía**.

## Resuelto (2026-09-14)

Estado: implementado, commiteado y pusheado a `main` (`c87607e`), con tests en verde (238/238 en motor-contactos, incluida toda la suite de integración del pipeline de dedup sin cambios de comportamiento).

### 1. Base definitiva: `motor-contactos`
Confirmado, sin cambios sobre `src/` (sigue existiendo tal cual, no se tocó).

### 2. `persona_id` — identificador estable

Nuevo campo en la tabla `clusters` de `staging.sqlite` (migración automática vía el mecanismo `_COLUMNAS_NUEVAS` ya existente en `staging_db.py`, corre sola la próxima vez que se abra la base — no hace falta nada manual), más una tabla nueva `personas (persona_id PRIMARY KEY, creado_en)` que registra cuándo se creó cada persona (necesaria para el criterio de desempate).

**Regla de supervivencia al fusionar dos clusters con `persona_id` ya asignado** (implementada en `motor/dedup/persona_id.py::elegir_persona_id_superviviente`):
1. Gana el `persona_id` del lado con **más `raw_records`** aportando al grupo fusionado.
2. Empate → gana el **más antiguo** (menor `personas.creado_en`).
3. Si ningún miembro del grupo tenía `persona_id` todavía (raw_records nunca antes clusterizados) → se crea uno nuevo (`uuid4`).

Esta regla se aplica de forma consistente en los tres lugares donde `clusters` cambia:
- `deduplicar_todo()` (corrida completa/incremental) — incluye el caso de agregar un raw_record nuevo a un cluster ya existente (el existente gana trivialmente, por ser el único con votos).
- `aplicar_decision_lote()` → `_fusionar_pares_de_clusters()` (aprobar una fusión pendiente desde el revisor).
- Al separar (`deshacer()` / `deshacer_ultima_corrida()`): un cluster separado pasa a ser N personas distintas, así que no hay un único `persona_id` "correcto". Se definió: el `raw_record_id` más chico del grupo conserva el `persona_id` existente (mínima disrupción para quien ya lo tenga cacheado afuera), y cada uno de los demás recibe un `persona_id` nuevo.

`cluster_id` sigue existiendo exactamente igual que antes (interno, cambia con cada fusión/separación) — `persona_id` es la referencia nueva que hay que usar desde afuera, nunca `cluster_id`.

### 3. `updated_at` a nivel de contacto final

Se expone ahora en `_serializar_contacto()` (`api.py`) y en todo lo que devuelve `listar_contactos`/`obtener_contacto`/`buscar_contactos` (`export.py`). Se calcula como el máximo entre `clusters.actualizado_en` de todos los raw_records que integran el cluster, y `ediciones_manuales.actualizado_en` si el contacto tiene una corrección manual — es decir, refleja fusión, separación **y** edición manual, lo que pidas.

### 4. Tabla `contactos_finales` en Supabase + sincronización

**Tabla nueva** (`supabase/migrations/20260914_contactos_finales.sql`): `contactos_finales`, con `persona_id UUID PRIMARY KEY` + todas las columnas del `Contacto` actual (`nombre`, `apellido`, `cargo`, `organizacion`, `whatsapp[]`, `telefono_fijo[]`, `emails[]`, `tag`, `domicilio`, `ciudad`, `provincia`, `pais`, `cumpleanos`, `foto_url`, `nota_referencia`, `flags[]`, `editado_manualmente`) más `cluster_id` (solo como referencia de depuración, nunca como clave), `updated_at` y `sincronizado_en` (este último con trigger automático, para poder notar si `motor-contactos` dejó de sincronizar en algún momento, más allá de si el contacto cambió).

**Sincronización** (`motor-contactos/src/motor/supabase_sync.py`): después de cada corrida de `deduplicar_todo`, cada aprobación de fusión (`aplicar_decision_lote`), cada `deshacer`/`deshacer_ultima_corrida`, y cada edición manual (`guardar_edicion_manual`), se hace un `upsert` (en lotes de 200) de los `persona_id` que cambiaron hacia `contactos_finales`, vía la API REST que Supabase genera automáticamente (PostgREST), usando la service role key.

**Diseño deliberado: best-effort, nunca bloqueante.** Si `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` no están configurados (`motor-contactos/.env.example`, hoy no lo están) o la red falla, se loguea una advertencia y el pipeline de dedup sigue funcionando exactamente igual que antes de que existiera esta sincronización — nunca es la causa de que una corrida falle. Confirmado con tests dedicados (`tests/test_supabase_sync.py`) que corren el pipeline completo sin credenciales configuradas y verifican que ni siquiera se intenta una request de red.

**Para activarlo cuando quieras:** completar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `motor-contactos/.env` (nunca en `config.yaml` ni en el repo). La key de service role la sacás de Supabase → Project Settings → API → `service_role` — es la secreta, nunca la `anon`/`publishable` que ya usa la app web.

### 5. Row Level Security + API key por sistema

`contactos_finales` y la tabla nueva `contactos_api_keys` quedaron con RLS activado y **sin ninguna política para `anon`/`authenticated`** — mismo criterio que ya usaba `rate_limits` en este proyecto (`supabase/migrations/20260429_rate_limits.sql`). Solo dos caminos de acceso posibles:
- **`service_role`** — lo que usa `motor-contactos` para sincronizar (bypassea RLS siempre, es como funciona `service_role` en Supabase).
- **La Edge Function `contactos-api`** (`supabase/functions/contactos-api/index.ts`, nueva) — gateway de solo lectura que valida un header `X-Api-Key` contra `contactos_api_keys` (se guarda solo el hash SHA-256 de cada key, nunca la key en texto plano) y, si es válida y está activa, consulta `contactos_finales` internamente con el service role. Ningún sistema externo recibe el service role en ningún momento.

Soporta `GET /contactos-api?desde=<ISO8601>&pagina=&tamano=` — el parámetro `desde` filtra por `updated_at`, para que un consumidor pregunte "qué cambió desde la última vez" en vez de traer todo siempre (esto es lo que habilita el `updated_at` del punto 3).

**Cómo dar de alta una key nueva cuando conectes un sistema** (documentado también como comentario al principio de `contactos-api/index.ts`):
1. Generar un token random fuerte: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Calcular su hash SHA-256: `node -e "console.log(require('crypto').createHash('sha256').update('EL_TOKEN').digest('hex'))"`.
3. Insertar en `contactos_api_keys` (desde el SQL editor de Supabase, nunca con la anon key): `INSERT INTO contactos_api_keys (sistema, key_hash) VALUES ('mejoracrm', 'EL_HASH');`.
4. Darle el token del paso 1 (nunca el hash) al sistema consumidor, para que lo mande como header `X-Api-Key`. Si se pierde o hay que rotarlo: `UPDATE contactos_api_keys SET activo = false WHERE sistema = '...'` y repetir desde el paso 1.

Hoy no hay ninguna fila en `contactos_api_keys` — cuando quieras conectar MejoraCRM (o MejoraWS), dar de alta su key con esos pasos es lo único que falta de este lado.

### Lo que sigue pendiente de decidir (no se tocó)

- Los campos de CRM y de WhatsApp identificados en el diagnóstico original (§3.2/3.3 abajo) — siguen sin agregarse, tal como pediste.
- Qué pasa con `src/` (la app web original) — sigue existiendo, no se tocó ni se deprecó.
- Backfill inicial: la primera vez que corras `deduplicar_todo` con Supabase configurado, va a intentar sincronizar los ~8.500 contactos existentes en un solo llamado a `deduplicar_todo` (en lotes de 200 vía HTTP) — no debería ser un problema, pero es la primera vez que se va a probar ese volumen contra la red real.

---

# Esquema de contacto compartido — diagnóstico

**Fecha:** 2026-09-14 · **Alcance:** solo diagnóstico y documentación. No se modificó ningún esquema, tabla, tipo ni código — ni en este repo ni en MejoraCRM/MejoraWS.

## 0. Aclaración importante antes de todo: hoy hay DOS sistemas de contactos en este repo, no uno

El repo tiene dos subsistemas de contactos que conviven, con arquitecturas totalmente distintas. Antes de diseñar el esquema compartido hay que decidir cuál es la base — este documento recomienda uno, pero es una decisión que falta tomar explícitamente.

| | `src/` (app web original) | `motor-contactos/` (motor nuevo, fusionado 2026-08-15) |
|---|---|---|
| **Qué es** | Herramienta de limpieza/deduplicación de una sola sesión en el navegador | Pipeline completo con base de datos persistente, panel de revisión y API JSON |
| **Almacenamiento** | IndexedDB del navegador (`idb`), efímero — se borra y recrea el object store en cada upgrade de versión | SQLite local (`staging.sqlite`) en la máquina de Pablo, con journaling WAL |
| **Persistencia entre sesiones** | No (es una herramienta de "subís, limpiás, exportás") | Sí — 8.590 contactos finales / 36.102 registros normalizados hoy |
| **Tipo principal** | `UnifiedContact` (`src/types/contact.ts`) | `Contacto` (`motor-contactos/ui/src/types.ts`) + esquema SQL en `staging_db.py` |
| **API** | Ninguna — todo corre client-side | Sí, Flask JSON local (`motor-contactos/src/motor/api.py`) |

**Recomendación de base para lo que sigue: `motor-contactos`.** Es el único de los dos con persistencia real, historial auditable, y una API ya arrancada. El resto de este documento describe su esquema. El de `src/` lo dejo documentado abajo (§4) solo como referencia porque técnicamente "ya existe", pero no es un candidato razonable a fuente de verdad porque no persiste nada entre sesiones.

---

## 1. Esquema actual — `motor-contactos` (SQLite, `staging_db.py`)

Arquitectura en capas, pensada para auditoría (nada se sobreescribe destructivamente):

```
raw_records          →  normalized_records  →  clusters  →  "contacto final" (vista calculada)
(fila cruda tal cual     (misma fila, parseada    (raw_record_id → cluster_id:
 vino del archivo/        y normalizada a           qué raw_records son
 fuente de origen,        campos limpios)            la misma persona)
 nunca se edita)
                                                   ediciones_manuales
                                                   (correcciones humanas por
                                                    cluster_id, pisan el valor
                                                    calculado, nunca tocan raw)
```

### Tablas

- **`raw_records`** — una fila por cada registro importado, tal cual vino de la fuente (`source_file`, `source_row`, `raw_json`). Nunca se edita ni se borra.
- **`normalized_records`** — la salida de los normalizadores aplicados a cada `raw_record`:
  `nombre, apellido, organizacion, cargo, telefonos_e164 (JSON), telefonos_fijo_e164 (JSON), emails (JSON), domicilio, ciudad, provincia, pais, tag, cumpleanos, foto_url, notas, flags (JSON)`.
- **`telefono_index`** / **`email_index`** — índices para el blocking de deduplicación (buscar candidatos a fusionar por teléfono/email compartido).
- **`clusters`** — `raw_record_id → cluster_id`, más `decidido_por` (regla/humano), `confianza`, `corrida_id`. El "contacto maestro" es una **vista calculada** sobre esta tabla — no existe una tabla `contacts` física con una fila por persona.
- **`decisiones_log`** — auditoría append-only de cada fusión/separación. Nunca se borra, ni al deshacer.
- **`aprendizaje_umbrales`** — tasa de aceptación humana por patrón, para ajustar el scoring de dedup con el tiempo.
- **`ediciones_manuales`** — correcciones manuales por `cluster_id` (pisan el valor calculado, nunca tocan `raw_records`): incluye también `whatsapp_json`, `telefono_fijo_json`, `emails_json` para corregir teléfonos/emails a mano.
- **`busqueda_fts`** — índice FTS5 (full-text search) sobre nombre/apellido/organización/teléfonos/emails/notas.

### El "contacto final" tal como lo devuelve la API hoy (`Contacto`, `api.py` → `_serializar_contacto`)

```typescript
interface Contacto {
  cluster_id: string;       // ver §3.1 — NO es estable, ver más abajo
  nombre: string;
  apellido: string;
  cargo: string;
  organizacion: string;
  whatsapp: string[];       // uno o más números, formato E.164
  telefono_fijo: string[];  // uno o más, formato E.164
  emails: string[];
  tag: string;               // ver clasificación abajo
  domicilio: string;
  ciudad: string;
  provincia: string;
  pais: string;
  cumpleanos: string;
  foto_url: string;
  nota_referencia: string;
  flags: string[];
  editado_manualmente: boolean;
}
```

Es un objeto **materializado en cada consulta** (join de `clusters` + `raw_records` + `normalized_records`, con `ediciones_manuales` aplicadas encima) — no hay una fila persistida que sea literalmente "el contacto".

### Clasificación que existe hoy

El único campo de clasificación real es **`tag`**, con 5 valores posibles (`tagging.py`):

```python
_TAGS_VALIDOS = ("familiar", "laboral", "cliente", "proveedor", "personal")
```

Se asigna con una heurística de palabras clave sobre cargo/organización/notas (sin IA — un diccionario alcanza), con prioridad `familiar > cliente > proveedor > laboral (si hay cargo u organización) > personal (default)`. El usuario puede corregirlo a mano en el revisor web, y esa corrección manual siempre gana sobre la heurística.

**Aclaración importante:** revisé el código y la documentación completa (`ESPECIFICACION.md`, `DECISIONES.md`, `PENDIENTES.md`, `CLAUDE.md`) buscando específicamente los conceptos "particular/empresarial", "tipo" y "familia" como campos — **no existen como tales en el código actual**. Lo más parecido es este único campo `tag`, que mezcla en una sola dimensión lo que vos describiste como varias (relación personal vs. comercial, y dentro de eso el tipo). Si en una conversación anterior te mencioné esos campos como ya existentes, no es lo que encontré revisando el repo ahora — prefiero avisarte esto explícitamente a que el documento asuma algo que no está en el código.

---

## 2. API que ya existe hoy

**Sí existe una API REST JSON**, corriendo en Flask sobre el mismo proceso que el panel de revisión (`motor-contactos/src/motor/api.py`), puerto `5000` por defecto (`config.yaml` → `revisor.puerto`):

| Endpoint | Método | Qué hace |
|---|---|---|
| `/api/stats` | GET | Contadores (raw, normalizados, contactos finales, pendientes de revisión) |
| `/api/contactos` | GET | Lista paginada o búsqueda (`?q=`) — devuelve `Contacto[]` |
| `/api/contactos/<cluster_id>` | GET | Un contacto puntual |
| `/api/contactos/<cluster_id>` | POST | Edición manual (escribe en `ediciones_manuales`) |
| `/api/revisar` | GET | Pares/grupos pendientes de decisión de dedup |
| `/api/decidir` | POST | Aplica una decisión de fusión en lote |
| `/api/deshacer/<cluster_id>` / `/api/deshacer-ultima-corrida` | POST | Revierte fusiones |
| `/api/accion/<nombre>` | POST | Dispara acciones (ej. importar de Google) |
| `/api/anomalias` | GET | Teléfonos sospechosos (compartidos por muchos contactos) |

**Pero — y esto es central para lo que estás por hacer — esta API tiene dos límites de diseño explícitos y deliberados que la hacen no apta, tal cual está, para que MejoraCRM o MejoraWS la consuman:**

1. **CORS bloqueado a localhost.** El propio código lo dice: *"el único consumidor es el dev server de Vite en localhost — se refleja el Origin solo si es localhost/127.0.0.1, nunca un wildcard"*. No es una config a cambiar con un flag — es un diseño pensado para un solo consumidor local.
2. **Vive y corre solo en la máquina de Pablo.** El backend es un proceso Flask que arranca a mano (o vía `.bat`) sobre un archivo SQLite local. No hay deploy, no hay URL pública, no hay proceso siempre-activo. MejoraCRM (hosteado en Vercel, `crm.mejoraok.com`) no tiene forma de llegar a esto hoy, ni aunque se le abriera el CORS.

MejoraWS sí corre en la misma máquina (o podría), así que *para MejoraWS puntualmente* esta API local ya sería alcanzable con menos cambios — pero la integración documentada hoy entre motor-contactos y MejoraWS **no usa esta API**: es un export/import manual por CSV (`exportar_whatsapp_csv()`, ver `PENDIENTES.md` — "WhatsApp / MejoraWS": exportás un CSV con el formato exacto que espera MejoraWS, y lo importás ahí a mano). No hay sync en vivo ni en un sentido ni en el otro hoy.

---

## 3. Huecos identificados (sin resolver — para decidir juntos)

### 3.1 — Identificador único y estable: HOY NO EXISTE. Este es el hueco más importante.

`cluster_id` es lo más parecido a un ID de persona hoy, pero **no es estable por diseño** — mirá cómo se genera (`merge_engine.py`):

```python
nuevo_cluster_id = f"c-{uuid.uuid5(uuid.NAMESPACE_OID, str(sorted(raw_ids_del_grupo)))}"
```

Es un hash determinístico del *conjunto de `raw_record_id` que integran el cluster en ese momento*. Consecuencia directa: **cada vez que se fusiona un contacto con otro, se deshace una fusión, o se corrige un cluster a mano, el `cluster_id` cambia.** Esto es intencional para la auditoría interna (permite reconstruir el árbol de fusiones), pero es exactamente lo contrario de lo que necesita un sistema externo: si MejoraCRM guarda `cluster_id = "c-abc123"` como referencia a un contacto, y ese contacto se refusiona mañana, la referencia queda rota sin aviso.

Lo único realmente inmutable hoy es `raw_record_id` — pero identifica una *fila cruda de una fuente*, no una *persona*: una persona con 3 fuentes (Google, WhatsApp export, tarjeta escaneada) tiene 3 `raw_record_id` distintos y ninguno de los tres es "la persona".

**Conclusión:** hace falta un ID nuevo, generado una sola vez por persona real (ej. UUID v4 al crear el cluster por primera vez) que persista aunque el cluster se refusione — hoy no hay ningún campo así. No lo agregué; es la primera decisión de diseño a tomar antes de exponer nada hacia afuera.

### 3.2 — Campos que probablemente necesite el CRM (no están hoy)

Identificados, no agregados:
- Estado en el funnel de ventas / pipeline (ej. lead / contactado / negociación / cliente / perdido)
- Vendedor o responsable asignado
- Vínculo a oportunidad/deal (si MejoraCRM maneja eso como entidad separada)
- Valor estimado de la oportunidad
- Fecha de último contacto / próxima acción programada
- Score o calificación de lead
- Historial de interacciones comerciales (llamadas, reuniones, propuestas enviadas)

### 3.3 — Campos que probablemente necesite WhatsApp (no están hoy)

Identificados, no agregados:
- Último mensaje enviado/recibido (contenido y timestamp)
- Estado de la conversación (abierta / pendiente de respuesta / cerrada)
- Opt-in / consentimiento para recibir mensajes (relevante dado el riesgo de ban que ya maneja MejoraWS)
- Canal de contacto preferido, si hay más de un número por persona
- ID del hilo/conversación en MejoraWS (para no duplicar lógica de mensajería, solo referenciarla)

### 3.4 — Otro hueco que encontré revisando, no pedido explícitamente pero relevante

**No hay `updated_at` a nivel de "contacto final".** `normalized_records` tiene `creado_en` y `clusters` tiene `actualizado_en`, pero ninguno de los dos se expone en `_serializar_contacto` (el objeto `Contacto` que devuelve la API). Sin esto, un sistema externo no tiene forma de preguntar "qué contactos cambiaron desde la última vez que sincronicé" — tendría que traer la lista completa cada vez. Si MejoraCRM/MejoraWS van a sincronizar (no solo leer una vez), esto también hay que resolverlo, junto con el ID estable.

---

## 4. Esquema actual — `src/` (app web original), como referencia

Documentado por completitud, ver §0 para por qué no lo recomiendo como base:

```typescript
interface UnifiedContact {
  id: string;
  firstName: string;
  lastName: string;
  whatsapp: string;
  company: string;
  jobTitle: string;
  email: string;
  source: string;
  isDuplicate: boolean;
  duplicateOf?: string;
  confidence: number;
  aiCleaned: boolean;
  phoneValid?: boolean;
  phoneWhatsApp?: boolean;
  phoneCountry?: string;
  validationScore?: number;
  fieldValidations?: FieldValidation[];
  city?: string;
  notes?: string;
  origin?: string;
  relevanceScore?: number;
  segment?: "A" | "B" | "C";
  needsAIScoring?: boolean;
}
```

Guardado en IndexedDB (`idb`), base `mejoraapp`, object store `contacts` — **se borra y recrea en cada upgrade de versión del schema** (ver `src/lib/db.ts`), consistente con ser una herramienta de limpieza de una sesión, no un almacén persistente. No tiene tag/clasificación de relación (familiar/laboral/etc.) — tiene en cambio `segment: "A"|"B"|"C"` (score de relevancia) y campos orientados a limpieza de datos (`confidence`, `aiCleaned`, `phoneValid`) que `motor-contactos` no tiene.

---

## 5. Cómo exponer esto hacia afuera — recomendación

Tres opciones evaluadas:

### Opción A — Acceso directo al archivo SQLite (descartada)
Ni MejoraCRM ni MejoraWS podrían abrir `staging.sqlite` de forma segura: es un archivo local, con locking de un solo escritor, en la máquina de Pablo. MejoraCRM (hosteado) no tiene ninguna vía de red hacia ese archivo, y aunque la tuviera, SQLite no está pensado para acceso concurrente multi-proceso a través de la red. Descartada de plano para MejoraCRM; en teoría posible para MejoraWS si corre en la misma máquina, pero acoplaría MejoraWS a la disponibilidad y el path exacto del archivo de Pablo — fragil.

### Opción B — Extender la API Flask local actual (parcial, no alcanza sola)
Le sacaría el candado de CORS y le sumaría auth, pero seguiría corriendo solo cuando Pablo prende su máquina y solo alcanzable en esa red. Resolvería el caso MejoraWS (si corre en la misma máquina o red local) pero no resuelve MejoraCRM, que está en Vercel — necesita un endpoint con URL pública, siempre activo.

### Opción C — API REST hosteada sobre una base de datos compartida (recomendada)

Mi recomendación es migrar el "contacto final" (no necesariamente todo el pipeline de dedup) a una base de datos accesible por red, y exponerla vía REST con auth — con dos formas de llegar ahí:

1. **La más simple de aprovechar lo que ya existe:** este mismo repo ya tiene un proyecto Supabase conectado (hoy usado solo para edge functions de OAuth/proxy/logging, ver `supabase/functions/`). Supabase genera automáticamente una API REST (PostgREST) sobre cualquier tabla Postgres, con Row Level Security para controlar qué puede leer/escribir cada sistema (CRM, WhatsApp) con su propia API key. `motor-contactos` seguiría siendo el pipeline de ingesta/limpieza/dedup local (eso funciona bien y no hay razón para tocarlo), pero en vez de que el "contacto final" viva solo en `staging.sqlite`, se sincroniza a una tabla Postgres en ese mismo proyecto Supabase — esa tabla pasa a ser la fuente de verdad que consultan CRM y WhatsApp.
2. **La alternativa más liviana:** hostear el propio Flask (o un reemplazo mínimo) en algún servicio siempre-activo (Render, Fly.io, un VPS chico) apuntando a una copia sincronizada de la base. Funciona, pero es infraestructura nueva a mantener sin reusar nada de lo que ya está pago/configurado.

**Por qué C y no A/B:** porque el problema de fondo no es "cómo le pego una consulta a la base" sino que hoy la base *vive en una laptop que se prende y se apaga*, y dos sistemas de negocio (uno hosteado) no pueden depender de eso. Cualquier solución que no resuelva "esto tiene que estar accesible 24/7 desde internet, con auth" es un parche que va a volver a trabarse apenas MejoraCRM lo necesite de verdad.

Esto es una decisión de arquitectura más grande que un simple "cómo expongo el endpoint" — la dejo señalada acá con mi justificación para que la resolvamos juntos antes de tocar nada, tal como pediste.

---

## Resumen de lo que falta decidir (nada de esto se tocó)

1. ¿`motor-contactos` es la base, dejando `src/` como está o deprecándolo? (recomendado: sí)
2. ¿Cómo se genera el ID estable por persona, y quién lo asigna la primera vez?
3. Qué campos de CRM y de WhatsApp de los identificados en §3.2/3.3 se agregan, y en qué tabla (¿extienden `normalized_records`/`ediciones_manuales`, o son tablas nuevas relacionadas por el ID estable?)
4. ¿Se migra el contacto final a Supabase Postgres (opción C.1) o se hostea el Flask actual (opción C.2)?
5. Esquema de auth para que CRM y WhatsApp consuman la API (API key por sistema, JWT, service role de Supabase, etc.)
