-- contactos_finales / contactos_api_keys — soporte de sincronización de
-- DOBLE VÍA (2026-09-16). Hasta acá, contactos-api era solo lectura y todo
-- contacto en la tabla venía de motor-contactos (siempre tenía cluster_id).
-- A partir de esta migración, sistemas externos (MejoraCRM primero) pueden
-- CREAR y ACTUALIZAR contactos acá vía POST en contactos-api -- esos
-- contactos no tienen cluster_id (nunca pasaron por el pipeline de dedup
-- local) hasta que, eventualmente, motor-contactos los importe. Ver
-- INFORME-SINCRONIZACION-CONTACTOS.md (en MejoraCRM) § "Hueco conocido" para
-- el detalle de esa limitación -- no se resuelve en esta migración.

-- cluster_id deja de ser obligatorio: un contacto creado desde afuera
-- (ej. un vendedor cargando un cliente nuevo en MejoraCRM) no tiene un
-- cluster local todavía.
ALTER TABLE contactos_finales ALTER COLUMN cluster_id DROP NOT NULL;

-- origen: de dónde vino este contacto la primera vez. No cambia después
-- (un contacto creado en MejoraCRM sigue diciendo 'mejoracrm' aunque
-- después motor-contactos lo actualice) -- es procedencia, no "quién lo
-- tocó por última vez" (eso ya lo cubre sincronizado_en).
ALTER TABLE contactos_finales ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'motor-contactos';
ALTER TABLE contactos_finales ADD CONSTRAINT chk_contactos_finales_origen
  CHECK (origen IN ('motor-contactos', 'mejoracrm', 'mejoraws', 'MejoraDiagnostico', 'mejoradiagnostico', 'mejora_diagnostico', 'MejoraSM', 'mejorasm', 'mejora_sm'));

CREATE INDEX IF NOT EXISTS idx_contactos_finales_origen ON contactos_finales(origen);

-- puede_escribir: hasta ahora toda key era de solo lectura (GET). Una key
-- con puede_escribir=true puede además crear/actualizar contactos vía POST.
-- Default false a propósito -- dar de alta una key de escritura es un paso
-- consciente aparte, no algo que se herede sin querer.
ALTER TABLE contactos_api_keys ADD COLUMN IF NOT EXISTS puede_escribir BOOLEAN NOT NULL DEFAULT FALSE;

-- contactos_sync_log: auditoría de cada sincronización (push o pull) que
-- pasó por contactos-api -- éxito, cantidad de contactos, y el error si
-- falló. Pensada para poder responder "¿cuándo fue la última vez que
-- sincronizó tal sistema, y le funcionó?" sin tener que ir a leer logs de
-- Edge Functions en el dashboard.
CREATE TABLE IF NOT EXISTS contactos_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema TEXT NOT NULL,
  direccion TEXT NOT NULL CHECK (direccion IN ('push', 'pull')),
  cantidad INTEGER NOT NULL DEFAULT 0,
  exito BOOLEAN NOT NULL,
  error TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contactos_sync_log_sistema_fecha ON contactos_sync_log(sistema, creado_en DESC);

ALTER TABLE contactos_sync_log ENABLE ROW LEVEL SECURITY;
-- Mismo criterio que el resto: sin políticas para anon/authenticated, solo
-- service_role (la Edge Function) escribe y lee acá.
