/**
 * Validación avanzada de teléfonos con libphonenumber-js.
 * Soporte E.164, detección de tipo (móvil/fijo), compatibilidad WhatsApp.
 */

import { parsePhoneNumber, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js';

export interface PhoneValidation {
  isValid: boolean;
  e164: string;
  isWhatsAppCompatible: boolean;
  country: string;
  countryName: string;
  nationalNumber: string;
  type: 'mobile' | 'landline' | 'voip' | 'toll_free' | 'unknown' | 'invalid';
  whatsappUrl: string;
  originalInput: string;
}

// Mapeo de códigos de país a nombres
const COUNTRY_NAMES: Record<string, string> = {
  AR: 'Argentina', ES: 'España', MX: 'México', CO: 'Colombia', CL: 'Chile',
  PE: 'Perú', VE: 'Venezuela', UY: 'Uruguay', PY: 'Paraguay', EC: 'Ecuador',
  BO: 'Bolivia', CR: 'Costa Rica', PA: 'Panamá', DO: 'Rep. Dominicana',
  GT: 'Guatemala', HN: 'Honduras', SV: 'El Salvador', NI: 'Nicaragua',
  CU: 'Cuba', PR: 'Puerto Rico', US: 'Estados Unidos', BR: 'Brasil',
  GB: 'Reino Unido', DE: 'Alemania', FR: 'Francia', IT: 'Italia',
  PT: 'Portugal', NL: 'Países Bajos', BE: 'Bélgica', CH: 'Suiza',
  CA: 'Canadá', AU: 'Australia', JP: 'Japón', CN: 'China',
  IN: 'India', RU: 'Rusia', ZA: 'Sudáfrica', NG: 'Nigeria',
};

// Prefijos conocidos de líneas fijas por país
const LANDLINE_PREFIXES: Record<string, string[]> = {
  AR: ['0800', '0810', '0610', '0611'],
  MX: ['01800'],
  ES: ['900', '800'],
};

// Prefijos conocidos de VoIP
const VOIP_PREFIXES = ['0800', '0500', '00500', '1800', '800'];

/**
 * Pre-procesa formatos argentinos comunes antes de parsear.
 * Maneja formatos locales como 011-15-XXXX-XXXX, 15-XXXX-XXXX, etc.
 */
function preprocessArgentineFormat(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');

  // 011-15-XXXX-XXXX (Buenos Aires móvil local)
  // 11 dígitos empezando con 0 + 15 en posición 3
  if (/^0\d{2}15\d{8}$/.test(digits)) {
    // 0 11 15 XXXX XXXX → +54 9 11 XXXX XXXX
    const area = digits.slice(1, 3); // 11
    const number = digits.slice(5); // 8 dígitos
    return `+549${area}${number}`;
  }

  // 0XX-15-XXXX-XXXX (interior móvil local)
  if (/^0\d{3}15\d{7,8}$/.test(digits)) {
    const area = digits.slice(1, digits.length - 10);
    const number = digits.slice(digits.length - 8);
    return `+549${area}${number}`;
  }

  // 15-XXXX-XXXX (móvil sin código de área, 10 dígitos)
  if (/^15\d{8}$/.test(digits)) {
    return `+549${digits.slice(2)}`;
  }

  // 0XX-XXXX-XXXX (fijo con 0 de área, 11 dígitos)
  if (/^0\d{10}$/.test(digits)) {
    return `+54${digits.slice(1)}`;
  }

  // 54XXXXXXXXXX o 549XXXXXXXXXXX (sin +)
  if (/^54[9]?\d{10,11}$/.test(digits)) {
    return `+${digits}`;
  }

  return phone;
}

/**
 * Pre-procesa formatos mexicanos comunes.
 */
function preprocessMexicanFormat(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');

  // 045 + 10 dígitos (móvil México)
  if (/^045\d{10}$/.test(digits)) {
    return `+521${digits.slice(3)}`;
  }

  // 01 + 10 dígitos (fijo México)
  if (/^01\d{10}$/.test(digits)) {
    return `+52${digits.slice(2)}`;
  }

  // 1 + 10 dígitos (móvil con indicativo)
  if (/^1\d{10}$/.test(digits)) {
    return `+52${digits}`;
  }

  return phone;
}

/**
 * Pre-procesa formatos españoles comunes.
 */
function preprocessSpanishFormat(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');

  // 9 dígitos sin prefijo (España)
  if (/^[679]\d{8}$/.test(digits)) {
    return `+34${digits}`;
  }

  // 0034 + 9 dígitos
  if (/^0034[679]\d{8}$/.test(digits)) {
    return `+34${digits.slice(4)}`;
  }

  return phone;
}

/**
 * Intenta pre-procesar el teléfono según formatos locales conocidos.
 */
function preprocessPhone(phone: string, defaultCountry?: CountryCode): string {
  let cleaned = phone.trim();

  // Si ya tiene +, parsear directamente
  if (cleaned.startsWith('+')) return cleaned;

  // Remover caracteres no numéricos (mantener +)
  const digits = cleaned.replace(/[^\d]/g, '');

  // Muy corto, inválido
  if (digits.length < 6) return cleaned;

  // Si tiene 10+ dígitos, intentar formatos locales según defaultCountry
  if (defaultCountry === 'AR' || (!defaultCountry && digits.length >= 10)) {
    const arResult = preprocessArgentineFormat(cleaned);
    if (arResult !== cleaned) return arResult;
  }

  if (defaultCountry === 'MX') {
    const mxResult = preprocessMexicanFormat(cleaned);
    if (mxResult !== cleaned) return mxResult;
  }

  if (defaultCountry === 'ES') {
    const esResult = preprocessSpanishFormat(cleaned);
    if (esResult !== cleaned) return esResult;
  }

  // Si tiene 10 dígitos y no se detectó formato, intentar Argentina por defecto
  if (digits.length === 10 && !defaultCountry) {
    return `+54${digits}`;
  }

  // Si tiene 11 dígitos empezando con 0, quitar el 0
  if (digits.length === 11 && digits.startsWith('0')) {
    // Intentar como argentino
    return `+54${digits.slice(1)}`;
  }

  return cleaned;
}

/**
 * Detecta si un número es compatible con WhatsApp.
 * WhatsApp solo acepta líneas móviles.
 */
function isWhatsAppCompatible(type: string | undefined): boolean {
  if (!type) return false;
  const mobileTypes = ['MOBILE', 'FIXED_LINE_OR_MOBILE'];
  return mobileTypes.includes(type);
}

/**
 * Clasifica el tipo de línea en español.
 */
function getLineTypeLabel(type: string | undefined): string {
  switch (type) {
    case 'MOBILE': return '📱 Móvil';
    case 'FIXED_LINE': return '📞 Fijo';
    case 'FIXED_LINE_OR_MOBILE': return '📱 Fijo/Móvil';
    case 'VOIP': return '💻 VoIP';
    case 'TOLL_FREE': return '🆓 Gratuito';
    default: return '❓ Desconocido';
  }
}

/**
 * Valida un número de teléfono y retorna información completa.
 *
 * @param phone - Número de teléfono en cualquier formato
 * @param defaultCountry - Código de país por defecto (ISO 3166-1 alpha-2)
 * @returns PhoneValidation con toda la información del número
 */
export function validatePhone(
  phone: string,
  defaultCountry: CountryCode = 'AR'
): PhoneValidation {
  const originalInput = phone;

  // Input vacío o muy corto
  if (!phone || phone.replace(/\D/g, '').length < 6) {
    return {
      isValid: false, e164: '', isWhatsAppCompatible: false,
      country: '', countryName: '', nationalNumber: '',
      type: 'invalid', whatsappUrl: '', originalInput,
    };
  }

  // Pre-procesar formatos locales
  const preprocessed = preprocessPhone(phone, defaultCountry);

  try {
    const parsed = parsePhoneNumber(preprocessed, defaultCountry);

    if (!parsed || !parsed.isValid()) {
      return {
        isValid: false, e164: preprocessed, isWhatsAppCompatible: false,
        country: '', countryName: '', nationalNumber: preprocessed,
        type: 'invalid', whatsappUrl: '', originalInput,
      };
    }

    const countryCode = parsed.country || '';
    const typeStr = parsed.getType() || 'unknown';
    const waCompatible = isWhatsAppCompatible(typeStr);
    const digits = parsed.nationalNumber?.toString() || '';

    return {
      isValid: true,
      e164: parsed.format('E.164'),
      isWhatsAppCompatible: waCompatible,
      country: countryCode,
      countryName: COUNTRY_NAMES[countryCode] || countryCode,
      nationalNumber: parsed.formatNational(),
      type: waCompatible ? 'mobile' : typeStr === 'FIXED_LINE' ? 'landline' : typeStr === 'VOIP' ? 'voip' : 'unknown',
      whatsappUrl: waCompatible ? `https://wa.me/${parsed.countryCallingCode}${digits}` : '',
      originalInput,
    };
  } catch {
    return {
      isValid: false, e164: '', isWhatsAppCompatible: false,
      country: '', countryName: '', nationalNumber: '',
      type: 'invalid', whatsappUrl: '', originalInput,
    };
  }
}

/**
 * Valida un lote de teléfonos.
 */
export function validatePhoneBatch(
  phones: string[],
  defaultCountry: CountryCode = 'AR'
): PhoneValidation[] {
  return phones.map(p => validatePhone(p, defaultCountry));
}

/**
 * Retorna el badge visual para un teléfono según su validación.
 */
export function getPhoneBadge(validation: PhoneValidation): {
  icon: string;
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
  if (!validation.isValid) {
    return { icon: '❌', label: 'Inválido', variant: 'destructive' };
  }
  if (validation.isWhatsAppCompatible) {
    return { icon: '📱', label: `WhatsApp ✓ ${validation.country}`, variant: 'default' };
  }
  return { icon: '📞', label: `Solo voz ${validation.country}`, variant: 'secondary' };
}

export { getLineTypeLabel };
