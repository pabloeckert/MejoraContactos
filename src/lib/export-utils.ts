import * as XLSX from "xlsx";
import type { UnifiedContact } from "@/types/contact";

function contactToRow(c: UnifiedContact) {
  return {
    Nombre: c.firstName,
    Apellido: c.lastName,
    WhatsApp: c.whatsapp,
    Empresa: c.company,
    Cargo: c.jobTitle,
    Email: c.email,
  };
}

export function exportCSV(contacts: UnifiedContact[]): string {
  const rows = contacts.map(contactToRow);
  const headers = Object.keys(rows[0] || {});
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => {
        const val = String((r as any)[h] || "");
        return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(",")
    ),
  ];
  return lines.join("\n");
}

export function exportExcel(clean: UnifiedContact[], discarded: UnifiedContact[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(clean.map(contactToRow));
  XLSX.utils.book_append_sheet(wb, ws1, "Contactos Limpios");
  if (discarded.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(discarded.map(contactToRow));
    XLSX.utils.book_append_sheet(wb, ws2, "Descartados");
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

export function exportVCF(contacts: UnifiedContact[]): string {
  return contacts
    .map((c) => {
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${c.lastName};${c.firstName};;;`,
        `FN:${c.firstName} ${c.lastName}`.trim(),
      ];
      if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${c.email}`);
      if (c.whatsapp) lines.push(`TEL;TYPE=CELL:${c.whatsapp}`);
      if (c.company) lines.push(`ORG:${c.company}`);
      if (c.jobTitle) lines.push(`TITLE:${c.jobTitle}`);
      lines.push("END:VCARD");
      return lines.join("\r\n");
    })
    .join("\r\n");
}

export function exportJSON(contacts: UnifiedContact[]): string {
  return JSON.stringify(contacts, null, 2);
}

export function downloadFile(content: string | Uint8Array, filename: string, mimeType: string) {
  const blob = typeof content === "string"
    ? new Blob([content], { type: mimeType })
    : new Blob([content.buffer as ArrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
