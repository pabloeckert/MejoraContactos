-- 20260918_contactos_finales_origen_mejorasm.sql
-- Día 5 del plan maestro: Integración de MejoraSM con contactos_finales
-- 1. Actualizar restricción chk_contactos_finales_origen para admitir 'MejoraSM', 'mejorasm', 'mejora_sm'
-- 2. Registrar o actualizar la API Key de MejoraSM en contactos_api_keys con permisos de escritura.

ALTER TABLE contactos_finales DROP CONSTRAINT IF EXISTS chk_contactos_finales_origen;
ALTER TABLE contactos_finales ADD CONSTRAINT chk_contactos_finales_origen
  CHECK (origen IN (
    'motor-contactos',
    'mejoracrm',
    'mejoraws',
    'MejoraDiagnostico',
    'mejoradiagnostico',
    'mejora_diagnostico',
    'MejoraSM',
    'mejorasm',
    'mejora_sm'
  ));

-- Alta / actualización de API key para MejoraSM
-- Token plano (32 bytes hex): b06fb0a66d0db70562e0c11c7f7399614976b3fa31e30181f479a7b5a80ce398
-- SHA-256: 2815028e362cb4baa68125d37a067332b3999fbafbec7406862ccc2fc73c90ab
INSERT INTO contactos_api_keys (sistema, key_hash, activo, puede_escribir)
VALUES (
  'MejoraSM',
  '2815028e362cb4baa68125d37a067332b3999fbafbec7406862ccc2fc73c90ab',
  true,
  true
)
ON CONFLICT (sistema) DO UPDATE
SET key_hash = EXCLUDED.key_hash,
    activo = EXCLUDED.activo,
    puede_escribir = EXCLUDED.puede_escribir;
