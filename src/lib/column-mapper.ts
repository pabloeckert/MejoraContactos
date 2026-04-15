import type { ColumnMapping, ContactField } from "@/types/contact";

// Auto-detect column mappings based on column names
const PATTERNS: Record<ContactField, RegExp> = {
  firstName: /^(first.?name|nombre|given.?name|primer.?nombre)$/i,
  lastName: /^(last.?name|apellido|family.?name|surname)$/i,
  fullName: /^(full.?name|name|nombre.?completo|display.?name|fn)$/i,
  email: /^(e?.?mail|correo|email.?address)$/i,
  phone: /^(phone|tel|telefono|teléfono|mobile|celular|cel|phone.?1|primary.?phone)$/i,
  phone2: /^(phone.?2|tel.?2|telefono.?2|secondary.?phone|work.?phone|home.?phone)$/i,
  company: /^(company|org|organization|empresa|organización|compañía)$/i,
  jobTitle: /^(job.?title|title|cargo|puesto|position)$/i,
  address: /^(address|street|dirección|direccion|calle)$/i,
  city: /^(city|ciudad|locality)$/i,
  state: /^(state|province|provincia|estado|region)$/i,
  country: /^(country|país|pais)$/i,
  zip: /^(zip|postal|código.?postal|codigo.?postal|zip.?code)$/i,
  notes: /^(notes?|notas?|comments?|observaciones)$/i,
  website: /^(website|web|url|sitio.?web)$/i,
  birthday: /^(birthday|birth.?date|cumpleaños|fecha.?nacimiento)$/i,
  ignore: /^$/,
};

export function autoDetectMappings(columns: string[]): ColumnMapping[] {
  return columns.map((col) => {
    for (const [field, pattern] of Object.entries(PATTERNS)) {
      if (field === "ignore") continue;
      if (pattern.test(col.trim())) {
        return { source: col, target: field as ContactField };
      }
    }
    return { source: col, target: "ignore" as ContactField };
  });
}
