import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export interface PhoneResult {
  valid: boolean;
  formatted: string;
  e164: string;
  country: string;
}

export function validatePhone(
  raw: string,
  defaultCountry: CountryCode = "AR"
): PhoneResult {
  if (!raw || raw.trim().length < 3) {
    return { valid: false, formatted: raw, e164: "", country: "" };
  }

  const cleaned = raw.replace(/[^\d+]/g, "");
  const phone = parsePhoneNumberFromString(cleaned, defaultCountry);

  if (phone && phone.isValid()) {
    return {
      valid: true,
      formatted: phone.formatInternational(),
      e164: phone.format("E.164"),
      country: phone.country || defaultCountry,
    };
  }

  return { valid: false, formatted: raw, e164: "", country: "" };
}

export function formatForWhatsApp(e164: string): string {
  return e164.replace(/[^\d]/g, "");
}
