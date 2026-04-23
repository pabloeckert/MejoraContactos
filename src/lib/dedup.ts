/**
 * Deduplicación optimizada con índice hash O(n).
 * Reemplaza el approach O(n²) de Jaro-Winkler full-scan.
 */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

export interface DedupResult {
  isDuplicate: boolean;
  duplicateOf?: string;
  confidence: number;
}

interface ContactForDedup {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  whatsapp: string;
}

/**
 * Índice hash para deduplicación O(n) en lugar de O(n²).
 * Mantiene índices por email, teléfono y nombre para búsquedas instantáneas.
 */
export class DedupIndex {
  // email normalizado → contactId
  private emailIndex = new Map<string, string>();

  // últimos 7 dígitos del teléfono → contactId
  private phoneIndex = new Map<string, string>();

  // nombre normalizado → [contactIds] (para fuzzy matching limitado)
  private nameIndex = new Map<string, string[]>();

  // Todos los contactos para fallback
  private contacts: ContactForDedup[] = [];

  /**
   * Agrega un contacto al índice y verifica si es duplicado.
   * Complejidad: O(1) para email/teléfono, O(k) para nombre donde k << n.
   */
  add(contact: ContactForDedup, threshold = 0.88): DedupResult {
    // 1. Verificación exacta por email (O(1))
    if (contact.email) {
      const normalizedEmail = normalize(contact.email);
      if (normalizedEmail && this.emailIndex.has(normalizedEmail)) {
        const existingId = this.emailIndex.get(normalizedEmail)!;
        return { isDuplicate: true, duplicateOf: existingId, confidence: 100 };
      }
    }

    // 2. Verificación exacta por teléfono (O(1))
    if (contact.whatsapp) {
      const digits = contact.whatsapp.replace(/[^\d]/g, "");
      if (digits.length >= 7) {
        const last7 = digits.slice(-7);
        if (this.phoneIndex.has(last7)) {
          const existingId = this.phoneIndex.get(last7)!;
          return { isDuplicate: true, duplicateOf: existingId, confidence: 95 };
        }
      }
    }

    // 3. Fuzzy matching por nombre — solo contra candidatos del índice (O(k))
    const fullName = normalize(`${contact.firstName}${contact.lastName}`);
    if (fullName.length >= 3) {
      // Buscar candidatos por primeros 3 caracteres (bucket)
      const bucket = fullName.slice(0, 3);
      const candidates = this.nameIndex.get(bucket) || [];

      for (const candidateId of candidates) {
        const candidate = this.contacts.find(c => c.id === candidateId);
        if (!candidate) continue;
        const candidateName = normalize(`${candidate.firstName}${candidate.lastName}`);
        if (candidateName.length < 3) continue;

        const sim = jaroWinkler(fullName, candidateName);
        if (sim >= threshold) {
          return { isDuplicate: true, duplicateOf: candidate.id, confidence: Math.round(sim * 100) };
        }
      }
    }

    // No es duplicado — agregar al índice
    this.contacts.push(contact);

    if (contact.email) {
      const normalizedEmail = normalize(contact.email);
      if (normalizedEmail) this.emailIndex.set(normalizedEmail, contact.id);
    }

    if (contact.whatsapp) {
      const digits = contact.whatsapp.replace(/[^\d]/g, "");
      if (digits.length >= 7) {
        this.phoneIndex.set(digits.slice(-7), contact.id);
      }
    }

    if (fullName.length >= 3) {
      const bucket = fullName.slice(0, 3);
      const existing = this.nameIndex.get(bucket) || [];
      existing.push(contact.id);
      this.nameIndex.set(bucket, existing);
    }

    return { isDuplicate: false, confidence: 70 };
  }

  /**
   * Retorna el número de contactos indexados.
   */
  get size(): number {
    return this.contacts.length;
  }

  /**
   * Limpia todos los índices.
   */
  clear(): void {
    this.emailIndex.clear();
    this.phoneIndex.clear();
    this.nameIndex.clear();
    this.contacts = [];
  }
}

/**
 * @deprecated Usa DedupIndex en su lugar — esta función es O(n²) y solo existe
 * por compatibilidad con código legacy. Será eliminada en la próxima versión.
 */
export function checkDuplicate(
  contact: { firstName: string; lastName: string; email: string; whatsapp: string },
  existing: ContactForDedup[],
  threshold = 0.88
): DedupResult {
  // Exact email match
  if (contact.email) {
    const emailMatch = existing.find(
      (e) => e.email && normalize(e.email) === normalize(contact.email)
    );
    if (emailMatch) {
      return { isDuplicate: true, duplicateOf: emailMatch.id, confidence: 100 };
    }
  }

  // Exact WhatsApp match (last 7 digits)
  if (contact.whatsapp) {
    const cleanPhone = contact.whatsapp.replace(/[^\d]/g, "");
    if (cleanPhone.length >= 7) {
      const last7 = cleanPhone.slice(-7);
      const phoneMatch = existing.find((e) => {
        const ep = e.whatsapp.replace(/[^\d]/g, "");
        return ep.length >= 7 && ep.slice(-7) === last7;
      });
      if (phoneMatch) {
        return { isDuplicate: true, duplicateOf: phoneMatch.id, confidence: 95 };
      }
    }
  }

  // Fuzzy name match
  const fullName = normalize(`${contact.firstName}${contact.lastName}`);
  if (fullName.length < 3) return { isDuplicate: false, confidence: 50 };

  for (const e of existing) {
    const eName = normalize(`${e.firstName}${e.lastName}`);
    if (eName.length < 3) continue;
    const sim = jaroWinkler(fullName, eName);
    if (sim >= threshold) {
      return { isDuplicate: true, duplicateOf: e.id, confidence: Math.round(sim * 100) };
    }
  }

  return { isDuplicate: false, confidence: 70 };
}
