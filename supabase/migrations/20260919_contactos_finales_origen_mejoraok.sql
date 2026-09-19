-- 20260919_contactos_finales_origen_mejoraok.sql
-- Integración de Mejoraok (landing comercial) con contactos_finales y contactos-api
-- 1. Actualizar restricción chk_contactos_finales_origen para admitir 'Mejoraok', 'mejoraok'
-- 2. Registrar o actualizar la API Key de Mejoraok en contactos_api_keys con permisos de escritura.

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
    'mejora_app',
    'MejoraSuite',
    'mejorasuite',
    'Mejoraok',
    'mejoraok'
  ));

-- Alta / actualización de API key para Mejoraok
-- Token plano (32 bytes hex): aec74a771a7ec402234501ac9ba1d0bb8490a7dc9e6a53a8aeed8e5f6855274a
-- SHA-256: df3e03df70a77b0f08fdb805e71fe73b8b47e7db02864671a645569deaaa92f7
INSERT INTO contactos_api_keys (sistema, key_hash, activo, puede_escribir)
VALUES (
  'Mejoraok',
  'df3e03df70a77b0f08fdb805e71fe73b8b47e7db02864671a645569deaaa92f7',
  true,
  true
)
ON CONFLICT (sistema) DO UPDATE
SET key_hash = EXCLUDED.key_hash,
    activo = EXCLUDED.activo,
    puede_escribir = EXCLUDED.puede_escribir;
