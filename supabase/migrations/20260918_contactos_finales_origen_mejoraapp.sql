-- 20260918_contactos_finales_origen_mejoraapp.sql
-- Día 6 del plan maestro: Integración de MejoraApp con contactos_finales
-- 1. Actualizar restricción chk_contactos_finales_origen para admitir 'MejoraApp', 'mejoraapp', 'mejora_app'
-- 2. Registrar o actualizar la API Key de MejoraApp en contactos_api_keys con permisos de escritura.

ALTER TABLE contactos_finales DROP CONSTRAINT IF EXISTS chk_contactos_finales_origen;
ALTER TABLE contactos_finales ADD CONSTRAINT chk_contactos_finales_origen
  CHECK (origen IN (
    'motor-contactos',
    'mejoracrm',
    'MejoraCRM',
    'mejoraws',
    'MejoraWS',
    'MejoraDiagnostico',
    'mejoradiagnostico',
    'mejora_diagnostico',
    'MejoraSM',
    'mejorasm',
    'mejora_sm',
    'MejoraApp',
    'mejoraapp',
    'mejora_app'
  ));

-- Alta / actualización de API key para MejoraApp
-- Token plano (32 bytes hex): a87936c05a3b39471007488850ec9ee568ded426f245e7c87f4d63a74483917b
-- SHA-256: 9686e5de89cf5da95691b2e2ba3f152e2016956106d086a2fb426bf58b1b73c0
INSERT INTO contactos_api_keys (sistema, key_hash, activo, puede_escribir)
VALUES (
  'MejoraApp',
  '9686e5de89cf5da95691b2e2ba3f152e2016956106d086a2fb426bf58b1b73c0',
  true,
  true
)
ON CONFLICT (sistema) DO UPDATE
SET key_hash = EXCLUDED.key_hash,
    activo = EXCLUDED.activo,
    puede_escribir = EXCLUDED.puede_escribir;
