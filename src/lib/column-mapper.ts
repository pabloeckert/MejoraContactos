import type { ColumnMapping, ContactField } from "@/types/contact";

const PATTERNS: Record<ContactField, RegExp> = {
  firstName: /^(first?.?name|nombre|given.?name|primer.?nombre|name|nom)$/i,
  lastName: /^(last?.?name|apellido|family.?name|surname|ape)$/i,
  whatsapp: /^(phone|tel|tel[eé]fono|mobile|celular|cel|whatsapp|wsp|wa|phone?.?1|primary?.?phone|telf|telefono|teléfono|f[eé]l[eé]fono)$/i,
  company: /^(company|org|organization|empresa|organizaci[oó]n|compa[ñn][ií]a|compania)$/i,
  jobTitle: /^(job?.?title|title|cargo|puesto|position|rol)$/i,
  email: /^(e?.?mail|correo|email?.?address|e-mail)$/i,
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
