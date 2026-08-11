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
