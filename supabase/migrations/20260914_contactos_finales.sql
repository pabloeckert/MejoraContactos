-- contactos_finales: fuente de verdad compartida de contactos, sincronizada
-- desde motor-contactos (SQLite local, este mismo repo) tras cada fusión o
-- edición manual. persona_id es el identificador estable -- nunca cambia,
-- a diferencia de cluster_id (interno de motor-contactos, se recalcula en
-- cada fusión/separación; se guarda igual acá solo como referencia de
-- depuración, nunca como clave). Ver ESQUEMA-CONTACTO-COMPARTIDO.md §
-- Resuelto para el diseño completo.
CREATE TABLE IF NOT EXISTS contactos_finales (
  persona_id UUID PRIMARY KEY,
  cluster_id TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  apellido TEXT NOT NULL DEFAULT '',
  cargo TEXT NOT NULL DEFAULT '',
  organizacion TEXT NOT NULL DEFAULT '',
  whatsapp TEXT[] NOT NULL DEFAULT '{}',
  telefono_fijo TEXT[] NOT NULL DEFAULT '{}',
  emails TEXT[] NOT NULL DEFAULT '{}',
  tag TEXT NOT NULL DEFAULT '',
  domicilio TEXT NOT NULL DEFAULT '',
  ciudad TEXT NOT NULL DEFAULT '',
  provincia TEXT NOT NULL DEFAULT '',
  pais TEXT NOT NULL DEFAULT '',
  cumpleanos TEXT,
  foto_url TEXT,
  nota_referencia TEXT NOT NULL DEFAULT '',
  flags TEXT[] NOT NULL DEFAULT '{}',
  editado_manualmente BOOLEAN NOT NULL DEFAULT FALSE,
  -- updated_at: última vez que cambió el CONTACTO dentro de motor-contactos
  -- (fusión, separación, edición manual) -- lo que un consumidor externo
  -- usa para preguntar "qué cambió desde tal fecha".
  updated_at TIMESTAMPTZ,
  -- sincronizado_en: última vez que ESTA FILA se escribió acá (distinto de
  -- updated_at -- ver trigger abajo). Útil para notar si motor-contactos
  -- dejó de sincronizar, más allá de si el contacto cambió o no.
  sincronizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contactos_finales_updated_at ON contactos_finales(updated_at);
CREATE INDEX IF NOT EXISTS idx_contactos_finales_cluster_id ON contactos_finales(cluster_id);

ALTER TABLE contactos_finales ENABLE ROW LEVEL SECURITY;
-- Deliberadamente sin políticas para anon/authenticated: nadie puede leer
-- ni escribir esta tabla directo con la anon key pública. Los únicos dos
-- caminos de acceso son:
--   (a) service_role -- motor-contactos sincronizando (bypassea RLS
--       siempre, es como funciona service_role en Supabase); y
--   (b) la Edge Function contactos-api (supabase/functions/contactos-api),
--       que valida una API key propia por sistema externo contra
--       contactos_api_keys y consulta acá adentro con el service role --
--       ningún sistema externo recibe nunca el service role en sí.

CREATE OR REPLACE FUNCTION set_sincronizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.sincronizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contactos_finales_sincronizado_en ON contactos_finales;
CREATE TRIGGER trg_contactos_finales_sincronizado_en
  BEFORE INSERT OR UPDATE ON contactos_finales
  FOR EACH ROW EXECUTE FUNCTION set_sincronizado_en();

-- contactos_api_keys: una fila por sistema externo autorizado a consumir
-- contactos-api (hoy: ninguno todavía -- se prepara la estructura para
-- cuando se conecte MejoraCRM, y después MejoraWS). Nunca se guarda la key
-- en texto plano, solo su hash SHA-256 -- ver README de la Edge Function
-- para cómo generar y dar de alta una key nueva.
CREATE TABLE IF NOT EXISTS contactos_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_uso_en TIMESTAMPTZ
);

ALTER TABLE contactos_api_keys ENABLE ROW LEVEL SECURITY;
-- Sin políticas -- solo service_role (la propia Edge Function, server-side)
-- puede leer esta tabla. Ningún cliente externo debe poder listar ni
-- verificar qué sistemas tienen una key dada de alta.
