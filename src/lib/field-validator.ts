/**
 * Validador semántico de campos de contacto.
 * Reglas determinísticas + heurísticas para detectar datos mal ubicados,
 * incompletos o inválidos sin necesidad de IA.
 */

import type { FieldValidation, ContactValidationResult, UnifiedContact } from '@/types/contact';
import { validatePhone } from './phone-validator';

// ─── Palabras prohibidas por campo ───

const JUNK_WORDS = new Set([
  'n/a', 'na', 'n.a.', 'none', 'null', 'undefined', '-', '--', '---',
  '.', '..', '...', 'xxx', 'xxxx', 'test', 'prueba', 'aaa', 'asdf',
  'sin dato', 'sin datos', 'no tiene', 'no aplica', 'desconocido',
  'no sé', 'tbd', 'pending', 'lorem', 'ipsum',
]);

const COMPANY_WORDS = new Set([
  'sa', 's.a.', 'srl', 's.r.l.', 'inc', 'inc.', 'corp', 'corp.',
  'llc', 'ltd', 'ltda', 'ltda.', 'gmbh', 'sas', 'spa', 's.p.a.',
  'co', 'co.', 'company', 'enterprise', 'enterprises', 'group',
  'grupo', 'industrias', 'services', 'soluciones', 'solutions',
]);

const TITLE_WORDS = new Set([
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cro', 'cpo', 'chro',
  'director', 'directora', 'gerente', 'manager', 'supervisor',
  'coordinador', 'coordinadora', 'jefe', 'jefa', 'analista',
  'desarrollador', 'desarrolladora', 'ingeniero', 'ingeniera',
  'consultor', 'consultora', 'asistente', 'auxiliar', 'vp',
  'presidente', 'presidenta', 'fundador', 'fundadora',
  'socio', 'socia', 'partner', 'empleado', 'empleada',
]);

// Typos comunes de emails
const EMAIL_DOMAIN_FIXES: Record<string, string> = {
  'gmal.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlokk.com': 'outlook.com',
};

// Dominios desechables/temporales
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'guerrillamail.com',
  'throwaway.email', 'temp-mail.org', 'fakeinbox.com',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com',
  'dispostable.com', 'trashmail.com',
]);

// Emails de rol (no personales)
const ROLE_PREFIXES = new Set([
  'info', 'contact', 'admin', 'support', 'help', 'sales',
  'marketing', 'hr', 'legal', 'finance', 'billing', 'noreply',
  'no-reply', 'postmaster', 'webmaster', 'abuse', 'security',
  'team', 'office', 'reception', 'hello', 'mail',
]);

// ─── Validación de nombres ───

function validateFirstNameField(value: string): FieldValidation {
  if (!value || JUNK_WORDS.has(value.toLowerCase().trim())) {
    return { field: 'firstName', isValid: false, score: 0, reason: 'Campo vacío o valor junk' };
  }

  // Contiene números → inválido
  if (/\d/.test(value)) {
    return { field: 'firstName', isValid: false, score: 10, reason: 'Un nombre no puede contener números' };
  }

  // Es una sigla corta sin vocales (ej: "DR", "CEO") → probablemente no es nombre
  if (value.length <= 3 && !/[aeiouáéíóú]/i.test(value) && value === value.toUpperCase()) {
    return { field: 'firstName', isValid: false, score: 5, reason: 'Parece una sigla, no un nombre' };
  }

  // Contiene palabras de empresa → campo equivocado
  const words = value.toLowerCase().split(/\s+/);
  for (const w of words) {
    if (COMPANY_WORDS.has(w)) {
      return { field: 'firstName', isValid: false, score: 5, reason: 'Parece un nombre de empresa' };
    }
  }

  // Contiene palabras de título/cargo → campo equivocado
  for (const w of words) {
    if (TITLE_WORDS.has(w)) {
      return { field: 'firstName', isValid: false, score: 10, reason: 'Parece un cargo, no un nombre' };
    }
  }

  // Contiene @ → es un email
  if (value.includes('@')) {
    return { field: 'firstName', isValid: false, score: 0, reason: 'Es un email, no un nombre' };
  }

  // Demasiado largo → probablemente no es solo un nombre
  if (value.length > 50) {
    return { field: 'firstName', isValid: false, score: 20, reason: 'Demasiado largo para ser un nombre' };
  }

  // Nombre completo en un solo campo (tiene espacio y ambas partes capitalizadas)
  if (value.includes(' ') && value.split(' ').length === 2) {
    const parts = value.split(' ');
    if (parts.every(p => p[0] === p[0].toUpperCase())) {
      return {
        field: 'firstName', isValid: true, score: 70,
        reason: 'Parece nombre completo, debería separarse en nombre + apellido',
        correctedValue: parts[0],
      };
    }
  }

  // OK
  return { field: 'firstName', isValid: true, score: 95 };
}

function validateLastNameField(value: string, firstName: string): FieldValidation {
  if (!value) {
    // Si firstName tiene 2+ palabras, el apellido podría estar ahí
    if (firstName && firstName.includes(' ')) {
      return { field: 'lastName', isValid: false, score: 30, reason: 'Apellido vacío pero el nombre parece completo' };
    }
    return { field: 'lastName', isValid: true, score: 60, reason: 'Apellido vacío' };
  }

  if (JUNK_WORDS.has(value.toLowerCase().trim())) {
    return { field: 'lastName', isValid: false, score: 0, reason: 'Valor junk' };
  }

  if (/\d/.test(value)) {
    return { field: 'lastName', isValid: false, score: 10, reason: 'Un apellido no puede contener números' };
  }

  // Igual al nombre → probable error
  if (value.toLowerCase() === firstName.toLowerCase() && firstName) {
    return { field: 'lastName', isValid: false, score: 15, reason: 'Apellido igual al nombre' };
  }

  // Contiene palabras de empresa
  const words = value.toLowerCase().split(/\s+/);
  for (const w of words) {
    if (COMPANY_WORDS.has(w)) {
      return { field: 'lastName', isValid: false, score: 5, reason: 'Parece un nombre de empresa' };
    }
  }

  if (value.includes('@')) {
    return { field: 'lastName', isValid: false, score: 0, reason: 'Es un email' };
  }

  // Apellido compuesto OK (de la Cruz, O'Brien, García-López)
  return { field: 'lastName', isValid: true, score: 95 };
}

// ─── Validación de email ───

function validateEmailField(value: string): FieldValidation {
  if (!value) {
    return { field: 'email', isValid: true, score: 50, reason: 'Email vacío' };
  }

  const cleaned = value.toLowerCase().trim();

  // Sintaxis básica
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return { field: 'email', isValid: false, score: 0, reason: 'Formato de email inválido' };
  }

  const [localPart, domain] = cleaned.split('@');

  // Dominio desechable
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { field: 'email', isValid: false, score: 10, reason: 'Dominio de email temporal/desechable' };
  }

  // Email de rol
  if (ROLE_PREFIXES.has(localPart)) {
    return {
      field: 'email', isValid: true, score: 60,
      reason: 'Email de rol (no personal)',
    };
  }

  // Typo en dominio
  if (EMAIL_DOMAIN_FIXES[domain]) {
    return {
      field: 'email', isValid: true, score: 75,
      reason: `Posible typo en dominio: ¿quisiste decir ${EMAIL_DOMAIN_FIXES[domain]}?`,
      correctedValue: `${localPart}@${EMAIL_DOMAIN_FIXES[domain]}`,
    };
  }

  // Dominio sin punto (typos como "gmailcom")
  if (!domain.includes('.')) {
    return { field: 'email', isValid: false, score: 10, reason: 'Dominio sin extensión' };
  }

  return { field: 'email', isValid: true, score: 95 };
}

// ─── Validación de empresa ───

function validateCompanyField(value: string): FieldValidation {
  if (!value || JUNK_WORDS.has(value.toLowerCase().trim())) {
    return { field: 'company', isValid: true, score: 50, reason: 'Empresa vacía' };
  }

  // Contiene @ → es un email en el campo equivocado
  if (value.includes('@')) {
    return { field: 'company', isValid: false, score: 5, reason: 'Es un email, no una empresa' };
  }

  // Es un número de teléfono
  if (/^[\d\s\-+()]{6,}$/.test(value)) {
    return { field: 'company', isValid: false, score: 5, reason: 'Es un teléfono, no una empresa' };
  }

  // Parece un nombre de persona (dos palabras capitalizadas, sin sufijos de empresa)
  const hasCompanySuffix = COMPANY_WORDS.has(value.toLowerCase().split(' ').pop() || '');
  if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(value) && !hasCompanySuffix) {
    return {
      field: 'company', isValid: true, score: 40,
      reason: 'Podría ser un nombre de persona en el campo de empresa',
    };
  }

  // Un cargo en el campo empresa
  const lowerVal = value.toLowerCase();
  if (TITLE_WORDS.has(lowerVal)) {
    return { field: 'company', isValid: false, score: 10, reason: 'Es un cargo, no una empresa' };
  }

  return { field: 'company', isValid: true, score: 95 };
}

// ─── Validación de cargo ───

function validateJobTitleField(value: string): FieldValidation {
  if (!value || JUNK_WORDS.has(value.toLowerCase().trim())) {
    return { field: 'jobTitle', isValid: true, score: 50, reason: 'Cargo vacío' };
  }

  // Es un email
  if (value.includes('@')) {
    return { field: 'jobTitle', isValid: false, score: 0, reason: 'Es un email, no un cargo' };
  }

  // Es un teléfono
  if (/^[\d\s\-+()]{6,}$/.test(value)) {
    return { field: 'jobTitle', isValid: false, score: 5, reason: 'Es un teléfono, no un cargo' };
  }

  // Demasiado vago
  const vague = new Set(['empleado', 'empleada', 'trabajador', 'trabajadora', 'staff', 'trabajo', 'worker']);
  if (vague.has(value.toLowerCase().trim())) {
    return { field: 'jobTitle', isValid: false, score: 15, reason: 'Cargo demasiado vago' };
  }

  // Parece un nombre de persona
  if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(value)) {
    return {
      field: 'jobTitle', isValid: true, score: 35,
      reason: 'Podría ser un nombre de persona en el campo de cargo',
    };
  }

  return { field: 'jobTitle', isValid: true, score: 95 };
}

// ─── Validación de WhatsApp ───

function validateWhatsAppField(value: string): FieldValidation {
  if (!value) {
    return { field: 'whatsapp', isValid: true, score: 50, reason: 'Teléfono vacío' };
  }

  const validation = validatePhone(value, 'AR');

  if (!validation.isValid) {
    return { field: 'whatsapp', isValid: false, score: 0, reason: 'Número de teléfono inválido' };
  }

  if (!validation.isWhatsAppCompatible) {
    return {
      field: 'whatsapp', isValid: true, score: 60,
      reason: `Número válido pero ${validation.type === 'landline' ? 'es línea fija' : 'no compatible con WhatsApp'}`,
    };
  }

  return {
    field: 'whatsapp', isValid: true, score: 95,
    reason: `WhatsApp válido (${validation.countryName})`,
  };
}

// ─── Funciones públicas ───

/**
 * Valida todos los campos de un contacto y retorna scores individuales.
 */
export function validateContactFields(contact: UnifiedContact): ContactValidationResult {
  const validations: FieldValidation[] = [
    validateFirstNameField(contact.firstName),
    validateLastNameField(contact.lastName, contact.firstName),
    validateWhatsAppField(contact.whatsapp),
    validateEmailField(contact.email),
    validateCompanyField(contact.company),
    validateJobTitleField(contact.jobTitle),
  ];

  // Score promedio
  const totalScore = validations.reduce((sum, v) => sum + v.score, 0);
  const overallScore = Math.round(totalScore / validations.length);

  return {
    contactId: contact.id,
    validations,
    overallScore,
    needsReview: overallScore < 60,
  };
}

/**
 * Valida un lote de contactos.
 */
export function validateContactBatch(contacts: UnifiedContact[]): ContactValidationResult[] {
  return contacts.map(validateContactFields);
}

/**
 * Retorna color del badge según score.
 */
export function getScoreColor(score: number): {
  bg: string;
  text: string;
  label: string;
  icon: string;
} {
  if (score >= 90) return { bg: 'bg-green-100', text: 'text-green-700', label: 'Excelente', icon: '🟢' };
  if (score >= 60) return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Observaciones', icon: '🟡' };
  return { bg: 'bg-red-100', text: 'text-red-700', label: 'Revisar', icon: '🔴' };
}

/**
 * Retorna icono de validación por campo.
 */
export function getFieldIcon(validation: FieldValidation): string {
  if (!validation.isValid) return '❌';
  if (validation.score >= 90) return '✅';
  if (validation.score >= 60) return '⚠️';
  return '❌';
}
