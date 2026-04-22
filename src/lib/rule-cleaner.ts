/**
 * Rule-based cleaner for obvious fixes — no AI needed.
 * Handles 80%+ of cleaning for high-volume data.
 */

import { validatePhone } from './phone-validator';

// Capitalize first letter of each word
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(?:^|\s|[-'])\S/g, (c) => c.toUpperCase())
    .trim();
}

// Remove common junk values
const JUNK = new Set([
  "n/a", "na", "n.a.", "none", "null", "undefined", "-", "--", "---",
  ".", "..", "...", "xxx", "xxxx", "test", "prueba", "aaa", "asdf",
  "sin dato", "sin datos", "no tiene", "no aplica", "desconocido",
]);

function cleanJunk(val: string): string {
  const lower = val.toLowerCase().trim();
  if (JUNK.has(lower) || lower.length < 2) return "";
  return val.trim();
}

// Clean email
function cleanEmail(email: string): string {
  const cleaned = email.toLowerCase().trim().replace(/\s+/g, "");
  // Basic validation
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return cleaned;
  return "";
}

/**
 * Clean and validate phone using libphonenumber-js.
 * Replaces the old regex-based approach.
 */
function cleanPhone(phone: string): string {
  if (!phone) return "";
  const validation = validatePhone(phone, 'AR');
  return validation.isValid ? validation.e164 : "";
}

/**
 * Auto-split: if firstName contains a full name and lastName is empty,
 * split into firstName + lastName.
 */
function autoSplitName(firstName: string, lastName: string): { firstName: string; lastName: string } {
  if (firstName && !lastName && firstName.includes(' ')) {
    const parts = firstName.trim().split(/\s+/);
    if (parts.length === 2) {
      return { firstName: parts[0], lastName: parts[1] };
    }
    // 3+ parts: first word = firstName, rest = lastName
    if (parts.length > 2) {
      return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
    }
  }
  return { firstName, lastName };
}

/**
 * Extract honorific prefix from name.
 * E.g., "Dr. Juan García" → prefix: "Dr.", name: "Juan García"
 */
function extractHonorific(name: string): { prefix: string; cleanName: string } {
  const honorifics = /^(Dr|Dra|Ing|Lic|Prof|Sr|Sra|Srta|Mr|Mrs|Ms|Don|Doña)\.?\s+/i;
  const match = name.match(honorifics);
  if (match) {
    return { prefix: match[1] + '.', cleanName: name.slice(match[0].length) };
  }
  return { prefix: '', cleanName: name };
}

export interface CleanResult {
  firstName: string;
  lastName: string;
  email: string;
  whatsapp: string;
  company: string;
  jobTitle: string;
  phoneValid: boolean;
  phoneWhatsApp: boolean;
  phoneCountry: string;
  rulesCleaned: boolean;
  needsAI: boolean;
}

export function ruleClean(contact: {
  firstName?: string;
  lastName?: string;
  email?: string;
  whatsapp?: string;
  company?: string;
  jobTitle?: string;
}): CleanResult {
  // Clean raw values
  let firstName = cleanJunk(contact.firstName || "");
  let lastName = cleanJunk(contact.lastName || "");
  const email = cleanEmail(contact.email || "");

  // Phone validation with libphonenumber-js
  const phoneValidation = validatePhone(contact.whatsapp || "", 'AR');
  const phone = phoneValidation.isValid ? phoneValidation.e164 : "";

  const company = cleanJunk(contact.company || "");
  const jobTitle = cleanJunk(contact.jobTitle || "");

  // Auto-split full name if needed
  const split = autoSplitName(firstName, lastName);
  firstName = split.firstName;
  lastName = split.lastName;

  // Extract honorific from name
  if (firstName) {
    const { cleanName } = extractHonorific(firstName);
    firstName = cleanName;
  }

  // Detect if AI is needed (ambiguous cases)
  let needsAI = false;

  // Name has numbers or weird chars → AI should handle
  if (/\d/.test(firstName + lastName)) needsAI = true;
  // Phone format unclear after rules
  if (contact.whatsapp && !phone) needsAI = true;
  // Company looks like a person name or vice versa
  if (company && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(company)) needsAI = true;

  return {
    firstName: firstName ? titleCase(firstName) : "",
    lastName: lastName ? titleCase(lastName) : "",
    email,
    whatsapp: phone,
    company: company ? titleCase(company) : "",
    jobTitle: jobTitle ? titleCase(jobTitle) : "",
    phoneValid: phoneValidation.isValid,
    phoneWhatsApp: phoneValidation.isWhatsAppCompatible,
    phoneCountry: phoneValidation.country,
    rulesCleaned: true,
    needsAI,
  };
}

/**
 * Batch rule-clean contacts. Returns cleaned contacts and indices that need AI.
 */
export function batchRuleClean(
  contacts: Partial<{ firstName: string; lastName: string; email: string; whatsapp: string; company: string; jobTitle: string }>[]
): { cleaned: CleanResult[]; aiIndices: number[] } {
  const cleaned: CleanResult[] = [];
  const aiIndices: number[] = [];

  for (let i = 0; i < contacts.length; i++) {
    const result = ruleClean(contacts[i]);
    cleaned.push(result);
    if (result.needsAI) aiIndices.push(i);
  }

  return { cleaned, aiIndices };
}
