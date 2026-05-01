/**
 * Validación con IA para casos ambiguos que las reglas determinísticas
 * no pudieron resolver. Usa el prompt mínimo para ahorrar tokens.
 */

import { supabase } from "@/integrations/supabase/client";
import { getActiveKeysMulti } from "@/lib/api-keys";
import { handleError } from "./error-handler";
import { validateContactFields } from "./field-validator";
import type { UnifiedContact, FieldValidation } from "@/types/contact";

// Cache de validaciones IA para no repetir
const validationCache = new Map<string, FieldValidation[]>();

function getCacheKey(contact: UnifiedContact): string {
  return `${contact.firstName}|${contact.lastName}|${contact.whatsapp}|${contact.email}|${contact.company}|${contact.jobTitle}`;
}

/**
 * Prompt compacto para validación de contacto — mínimo de tokens.
 */
function buildValidationPrompt(contact: UnifiedContact): string {
  return `Valida estos campos de contacto. Responde SOLO en JSON válido sin markdown.

Campos: nombre="${contact.firstName}", apellido="${contact.lastName}", empresa="${contact.company}", cargo="${contact.jobTitle}", email="${contact.email}", tel="${contact.whatsapp}"

Responde con este formato exacto:
{"nombre":true/false,"apellido":true/false,"empresa":true/false,"cargo":true/false,"email":true/false,"correcciones":{"nombre":"valor_corregido_o_null","apellido":"valor_corregido_o_null","empresa":"valor_corregido_o_null","cargo":"valor_corregido_o_null"}}`;
}

/**
 * Parsea la respuesta de la IA y convierte a FieldValidation[]
 */
function parseAIResponse(response: string, contact: UnifiedContact): FieldValidation[] {
  const validations: FieldValidation[] = [];

  try {
    // Limpiar markdown si lo hay
    const jsonStr = response.trim().replace(/^```\w*\n?/, '').replace(/\n?```$/, '');

    const parsed = JSON.parse(jsonStr) as Record<string, unknown> & { correcciones?: Record<string, string | null> };

    const fieldMap: Array<{ key: string; field: FieldValidation['field']; original: string }> = [
      { key: 'nombre', field: 'firstName', original: contact.firstName },
      { key: 'apellido', field: 'lastName', original: contact.lastName },
      { key: 'empresa', field: 'company', original: contact.company },
      { key: 'cargo', field: 'jobTitle', original: contact.jobTitle },
      { key: 'email', field: 'email', original: contact.email },
    ];

    for (const { key, field, original } of fieldMap) {
      const isValid = parsed[key] !== false;
      const correction = parsed.correcciones?.[key];

      validations.push({
        field,
        isValid,
        score: isValid ? 85 : 20,
        correctedValue: correction && correction !== original ? correction : undefined,
        reason: !isValid ? `IA: no es un ${field} válido` : correction ? `IA sugiere: ${correction}` : undefined,
      });
    }
  } catch (err) {
    handleError(err, {
      component: "ai-validator",
      action: "parseAIResponse",
      category: "ai",
      severity: "low",
      extra: { rawResponse: response?.slice(0, 200) },
    });
    // Si la IA devolvió algo inválido, marcar todo como no validado
    const fields: FieldValidation['field'][] = ['firstName', 'lastName', 'whatsapp', 'email', 'company', 'jobTitle'];
    for (const field of fields) {
      validations.push({
        field,
        isValid: true,
        score: 50,
        reason: 'Validación IA falló, datos sin verificar',
      });
    }
  }

  return validations;
}

/**
 * Valida un contacto con IA. Solo envía contactos que las reglas marcaron como ambiguos.
 * Retorna las validaciones de campo o null si no se pudo validar.
 *
 * Usa el endpoint clean-contacts en modo single con el prompt de validación
 * embebido en el campo firstName del contacto. La Edge Function lo limpiará
 * y devolverá el contacto corregido, que comparamos con el original para
 * derivar las validaciones.
 */
export async function validateContactWithAI(
  contact: UnifiedContact,
  provider: string
): Promise<FieldValidation[] | null> {
  // Check cache
  const cacheKey = getCacheKey(contact);
  if (validationCache.has(cacheKey)) {
    return validationCache.get(cacheKey)!;
  }

  try {
    const keys = await getActiveKeysMulti();

    // Enviamos el contacto real a la Edge Function para que lo limpie.
    // La IA corregirá los campos inválidos, y comparamos antes/después.
    const { data, error } = await supabase.functions.invoke("clean-contacts", {
      body: {
        contacts: [{
          firstName: contact.firstName,
          lastName: contact.lastName,
          whatsapp: contact.whatsapp,
          company: contact.company,
          jobTitle: contact.jobTitle,
          email: contact.email,
        }],
        provider: "single",
        customKeys: keys,
        singleProvider: provider,
      },
    });

    if (error || data?.error || !data?.contacts?.[0]) {
      // Fallback: usar reglas determinísticas
      const ruleResult = validateContactFields(contact);
      validationCache.set(cacheKey, ruleResult.validations);
      return ruleResult.validations;
    }

    const cleaned = data.contacts[0] as Record<string, string>;

    // Comparar original vs limpio para derivar validaciones
    const fieldMap: Array<{ field: FieldValidation['field']; original: string; cleaned: string }> = [
      { field: 'firstName', original: contact.firstName, cleaned: cleaned.firstName || '' },
      { field: 'lastName', original: contact.lastName, cleaned: cleaned.lastName || '' },
      { field: 'company', original: contact.company, cleaned: cleaned.company || '' },
      { field: 'jobTitle', original: contact.jobTitle, cleaned: cleaned.jobTitle || '' },
      { field: 'email', original: contact.email, cleaned: cleaned.email || '' },
      { field: 'whatsapp', original: contact.whatsapp, cleaned: cleaned.whatsapp || '' },
    ];

    const validations: FieldValidation[] = fieldMap.map(({ field, original, cleaned: cleanedVal }) => {
      const wasCleaned = original !== cleanedVal && cleanedVal !== '';
      const wasEmptied = original && !cleanedVal;
      const isUnchanged = original === cleanedVal;

      if (wasEmptied) {
        return { field, isValid: false, score: 15, reason: 'IA descartó el valor como inválido' };
      }
      if (wasCleaned) {
        return {
          field, isValid: true, score: 80,
          correctedValue: cleanedVal !== original ? cleanedVal : undefined,
          reason: `IA corrigió: "${original}" → "${cleanedVal}"`,
        };
      }
      if (isUnchanged && original) {
        return { field, isValid: true, score: 85 };
      }
      return { field, isValid: true, score: 50, reason: 'Campo vacío' };
    });

    validationCache.set(cacheKey, validations);
    return validations;
  } catch (err) {
    handleError(err, {
      component: "ai-validator",
      action: "validateContactWithAI",
      category: "ai",
      severity: "medium",
      extra: { provider, contactId: contact.id },
    });
    // Fallback: usar reglas determinísticas
    const ruleResult = validateContactFields(contact);
    validationCache.set(cacheKey, ruleResult.validations);
    return ruleResult.validations;
  }
}

/**
 * Valida un lote de contactos. Solo envía a IA los que las reglas no pudieron resolver.
 * Los demás usan validación determinística.
 */
export async function validateBatchWithAI(
  contacts: UnifiedContact[],
  onProgress?: (processed: number, total: number) => void
): Promise<Map<string, FieldValidation[]>> {
  const results = new Map<string, FieldValidation[]>();

  // Primero, validación determinística para todos
  const needsAI: UnifiedContact[] = [];
  const needsAICount = { count: 0 };

  for (const contact of contacts) {
    const ruleValidation = validateContactFields(contact);
    results.set(contact.id, ruleValidation.validations);

    // Los que necesitan revisión van a IA
    if (ruleValidation.needsReview) {
      needsAI.push(contact);
    }
  }

  if (needsAI.length === 0) {
    onProgress?.(contacts.length, contacts.length);
    return results;
  }

  // Enviar a IA solo los que necesitan revisión, en lotes de 10
  const BATCH_SIZE = 10;
  const allKeys = await getActiveKeysMulti();
  const provider = Object.keys(allKeys).find(k => allKeys[k].length > 0) || 'groq';

  let processed = contacts.length - needsAI.length;

  for (let i = 0; i < needsAI.length; i += BATCH_SIZE) {
    const batch = needsAI.slice(i, i + BATCH_SIZE);

    const promises = batch.map(async (contact) => {
      const aiResult = await validateContactWithAI(contact, provider);
      if (aiResult) {
        results.set(contact.id, aiResult);
      }
      processed++;
      onProgress?.(processed, contacts.length);
    });

    await Promise.all(promises);

    // Rate limit: esperar entre lotes
    if (i + BATCH_SIZE < needsAI.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * Limpia el cache de validaciones.
 */
export function clearValidationCache(): void {
  validationCache.clear();
}
