/**
 * Utilidades de enmascaramiento de PII para cumplimiento de privacidad (Ley 25.326).
 * Asegura que ningún teléfono o email en texto claro viaje a APIs o modelos externos.
 */

export function maskPhone(phone?: string | null): string {
  if (!phone || typeof phone !== "string") return "";
  const trimmed = phone.trim();
  if (trimmed.startsWith("****")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `****${digits.slice(-4)}`;
}

export function maskEmail(email?: string | null): string {
  if (!email || typeof email !== "string") return "";
  const trimmed = email.trim();
  if (!trimmed.includes("@")) return "****";
  const parts = trimmed.split("@");
  if (parts.length < 2 || !parts[1]) return "****";
  return `***@${parts[1].toLowerCase()}`;
}

export function maskFreeText(text?: string | null): string {
  if (!text || typeof text !== "string") return "";
  // Enmascarar emails
  let res = text.replace(/[\w.-]+@([\w.-]+)/g, "***@$1");
  // Enmascarar secuencias de teléfono
  res = res.replace(/\+?\d[\d\s\-.]{5,}\d/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 6) {
      return `****${digits.slice(-4)}`;
    }
    return match;
  });
  return res;
}

export interface MaskableContact {
  firstName?: string;
  lastName?: string;
  whatsapp?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  notes?: string;
  [key: string]: unknown;
}

export function maskContactForAI<T extends MaskableContact>(contact: T): T {
  return {
    ...contact,
    whatsapp: maskPhone(contact.whatsapp),
    email: maskEmail(contact.email),
    notes: contact.notes ? maskFreeText(contact.notes) : contact.notes,
  };
}
