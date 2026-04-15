import type { ColumnMapping, ContactField } from "@/types/contact";

const PATTERNS: Record<ContactField, RegExp> = {
  firstName: /^(first.?name|nombre|given.?name|primer.?nombre|name)$/i,
  lastName: /^(last.?name|apellido|family.?name|surname)$/i,
  whatsapp: /^(phone|tel|telefono|teléfono|mobile|celular|cel|whatsapp|wsp|wa|phone.?1|primary.?phone)$/i,
  company: /^(company|org|organization|empresa|organización|compañía)$/i,
  jobTitle: /^(job.?title|title|cargo|puesto|position|rol)$/i,
  email: /^(e?.?mail|correo|email.?address)$/i,
  ignore: /^$/,
};

export function autoDetectMappings(columns: string[]): ColumnMapping[] {
  const usedTargets = new Set<ContactField>();
  
  return columns.map((col) => {
    for (const [field, pattern] of Object.entries(PATTERNS)) {
      if (field === "ignore") continue;
      if (usedTargets.has(field as ContactField)) continue;
      if (pattern.test(col.trim())) {
        usedTargets.add(field as ContactField);
        return { source: col, target: field as ContactField };
      }
    }
    return { source: col, target: "ignore" as ContactField };
  });
}
