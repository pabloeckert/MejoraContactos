// Prompt definitions and builders for the clean-contacts pipeline.
// Extracted from index.ts for maintainability and configurability.

export interface RawContact {
  firstName?: string;
  lastName?: string;
  whatsapp?: string;
  company?: string;
  jobTitle?: string;
  email?: string;
}

export const SYSTEM_CLEAN =
  "Sos un limpiador de datos. Responde SOLO con JSON valido, sin markdown, sin explicaciones.";

export const SYSTEM_VERIFY =
  "Sos un verificador de datos. Revisas contactos limpiados por otra IA y detectas errores. Responde SOLO con JSON valido, sin markdown.";

export const SYSTEM_CORRECT =
  "Sos un corrector final de datos. Recibes contactos con posibles errores marcados y los corriges. Responde SOLO con JSON valido, sin markdown.";

export function buildCleanPrompt(batch: RawContact[]): string {
  return `Sos un asistente experto en limpieza de datos de contactos.
Recibis un array JSON de contactos desordenados. Tu tarea:

1. **Nombre**: Capitalizar correctamente. Si hay nombre completo en un solo campo, separar en firstName y lastName.
2. **Apellido**: Capitalizar correctamente.
3. **WhatsApp**: Formato internacional sin espacios ni guiones, solo numeros con codigo de pais. Sin codigo, asumir +54 (Argentina). Eliminar el 15 si es celular argentino.
4. **Empresa**: Limpiar y capitalizar. Quitar basura como "N/A", "-", ".", etc.
5. **Cargo**: Limpiar y capitalizar. Quitar basura.
6. **Email**: Limpiar, minusculas, validar formato basico. Si es invalido, dejar vacio.

IMPORTANTE:
- Si un campo tiene basura irreconocible, dejarlo vacio "".
- NO inventar datos.
- Devuelve SOLO el array JSON limpio.

Contactos a limpiar:
${JSON.stringify(batch)}`;
}

export function buildVerifyPrompt(
  original: RawContact[],
  cleaned: RawContact[]
): string {
  return `Recibes dos arrays: los datos ORIGINALES y los datos LIMPIADOS por otra IA.
Tu tarea es verificar que la limpieza fue correcta.

Para cada contacto, agrega un campo "issues" (array de strings) con los problemas encontrados.
Si no hay problemas, "issues" debe ser un array vacio [].

Devuelve SOLO el array JSON con el campo "issues" agregado.

ORIGINALES:
${JSON.stringify(original)}

LIMPIADOS:
${JSON.stringify(cleaned)}`;
}

export function buildCorrectPrompt(
  verified: (RawContact & { issues?: string[] })[]
): string {
  return `Recibes contactos verificados con posibles "issues" detectadas por otra IA.
Tu tarea es hacer la correccion final. Devuelve SOLO el array JSON final limpio (sin campo "issues").

Contactos a corregir:
${JSON.stringify(verified)}`;
}
