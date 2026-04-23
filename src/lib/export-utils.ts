import * as XLSX from "xlsx";
import type { UnifiedContact } from "@/types/contact";

interface ContactRow {
  Nombre: string;
  Apellido: string;
  WhatsApp: string;
  Empresa: string;
  Cargo: string;
  Email: string;
}

/** Escapa HTML para prevenir XSS en reportes */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function contactToRow(c: UnifiedContact): ContactRow {
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
        const val = String((r as Record<string, string>)[h] || "");
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

/**
 * Exporta contactos como JSONL para fine-tuning de IA.
 * Compatible con OpenAI, HuggingFace, Axolotl.
 */
export function exportJSONL(contacts: UnifiedContact[]): string {
  return contacts
    .map((c) => {
      const input = {
        firstName: c.firstName || "",
        lastName: c.lastName || "",
        whatsapp: c.whatsapp || "",
        email: c.email || "",
        company: c.company || "",
        jobTitle: c.jobTitle || "",
      };
      const output = { ...input };
      return JSON.stringify({
        messages: [
          { role: "user", content: JSON.stringify(input) },
          { role: "assistant", content: JSON.stringify(output) },
        ],
      });
    })
    .join("\n");
}

/**
 * Genera un informe HTML del trabajo realizado.
 */
export function generateHTMLReport(contacts: UnifiedContact[]): string {
  const clean = contacts.filter((c) => !c.isDuplicate);
  const dupes = contacts.filter((c) => c.isDuplicate);
  const aiCleaned = contacts.filter((c) => c.aiCleaned);
  const withEmail = clean.filter((c) => c.email).length;
  const withWhatsApp = clean.filter((c) => c.whatsapp).length;
  const withCompany = clean.filter((c) => c.company).length;
  const withJob = clean.filter((c) => c.jobTitle).length;

  // Sources breakdown
  const sources = new Map<string, number>();
  for (const c of clean) sources.set(c.source, (sources.get(c.source) || 0) + 1);
  const sourceRows = [...sources.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([src, count]) => `<tr><td>${escapeHtml(src)}</td><td>${count}</td><td>${((count / clean.length) * 100).toFixed(1)}%</td></tr>`)
    .join("\n");

  // Top companies
  const companies = new Map<string, number>();
  for (const c of clean) if (c.company) companies.set(c.company, (companies.get(c.company) || 0) + 1);
  const companyRows = [...companies.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([comp, count]) => `<tr><td>${escapeHtml(comp)}</td><td>${count}</td></tr>`)
    .join("\n");

  const date = new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
  const time = new Date().toLocaleTimeString('es-AR');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Informe MejoraContactos</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a2e; background: #f8fafb; padding: 40px; }
  .container { max-width: 800px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #1B4332; }
  .header h1 { font-size: 28px; color: #1B4332; margin-bottom: 4px; }
  .header p { color: #666; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .stat { background: white; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .stat-value { font-size: 32px; font-weight: 700; }
  .stat-label { font-size: 12px; color: #888; margin-top: 4px; }
  .green { color: #10B981; } .red { color: #EF4444; } .blue { color: #3B82F6; } .purple { color: #8B5CF6; }
  .section { background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .section h2 { font-size: 16px; margin-bottom: 16px; color: #1B4332; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; background: #f1f5f9; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
  tr:hover td { background: #f8fafc; }
  .bar { height: 8px; border-radius: 4px; background: #e2e8f0; overflow: hidden; margin-top: 4px; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .footer { text-align: center; color: #aaa; font-size: 11px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
  @media print { body { padding: 20px; } .section { break-inside: avoid; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📊 Informe MejoraContactos</h1>
    <p>Generado el ${date} a las ${time}</p>
  </div>

  <div class="grid">
    <div class="stat"><div class="stat-value green">${clean.length.toLocaleString()}</div><div class="stat-label">Contactos únicos</div></div>
    <div class="stat"><div class="stat-value red">${dupes.length.toLocaleString()}</div><div class="stat-label">Duplicados</div></div>
    <div class="stat"><div class="stat-value blue">${aiCleaned.length.toLocaleString()}</div><div class="stat-label">IA limpiados</div></div>
    <div class="stat"><div class="stat-value purple">${contacts.length.toLocaleString()}</div><div class="stat-label">Total procesados</div></div>
  </div>

  <div class="section">
    <h2>📋 Cobertura de campos</h2>
    <table>
      <tr><th>Campo</th><th>Cobertura</th><th></th></tr>
      <tr><td>📧 Email</td><td>${withEmail} / ${clean.length} (${((withEmail / clean.length) * 100).toFixed(1)}%)</td>
        <td><div class="bar"><div class="bar-fill blue" style="width:${(withEmail / clean.length) * 100}%"></div></div></td></tr>
      <tr><td>📱 WhatsApp</td><td>${withWhatsApp} / ${clean.length} (${((withWhatsApp / clean.length) * 100).toFixed(1)}%)</td>
        <td><div class="bar"><div class="bar-fill green" style="width:${(withWhatsApp / clean.length) * 100}%"></div></div></td></tr>
      <tr><td>🏢 Empresa</td><td>${withCompany} / ${clean.length} (${((withCompany / clean.length) * 100).toFixed(1)}%)</td>
        <td><div class="bar"><div class="bar-fill purple" style="width:${(withCompany / clean.length) * 100}%"></div></div></td></tr>
      <tr><td>💼 Cargo</td><td>${withJob} / ${clean.length} (${((withJob / clean.length) * 100).toFixed(1)}%)</td>
        <td><div class="bar"><div class="bar-fill red" style="width:${(withJob / clean.length) * 100}%"></div></div></td></tr>
    </table>
  </div>

  <div class="section">
    <h2>📁 Desglose por fuente</h2>
    <table><tr><th>Fuente</th><th>Contactos</th><th>% del total</th></tr>${sourceRows}</table>
  </div>

  ${companyRows ? `<div class="section">
    <h2>🏢 Top 10 empresas</h2>
    <table><tr><th>Empresa</th><th>Contactos</th></tr>${companyRows}</table>
  </div>` : ''}

  <div class="footer">
    Generado por MejoraContactos v3 — Procesamiento con IA
  </div>
</div>
</body>
</html>`;
}

/**
 * Exporta correcciones como CSV para análisis.
 * Genera una fila por campo corregido, con el valor original y el nuevo.
 */
export function exportCorrectionsCSV(contacts: UnifiedContact[]): string {
  const corrected = contacts.filter((c) => c.aiCleaned);
  if (corrected.length === 0) return "";

  const headers = ["Contacto", "Campo", "Valor Original", "Valor Corregido"];
  const lines: string[] = [];

  for (const c of corrected) {
    const name = `${c.firstName} ${c.lastName}`.trim() || c.email || c.whatsapp || c.id;
    const fields: Array<[string, string, string]> = [
      ["firstName", c.firstName, c.firstName],
      ["lastName", c.lastName, c.lastName],
      ["whatsapp", c.whatsapp, c.whatsapp],
      ["email", c.email, c.email],
      ["company", c.company, c.company],
      ["jobTitle", c.jobTitle, c.jobTitle],
    ];
    for (const [field, original, current] of fields) {
      // Solo incluir campos que la IA realmente limpió (marcados como aiCleaned)
      // Como no guardamos el valor original pre-IA, exportamos los campos con contenido
      if (current) {
        lines.push([
          name, field, "", current
        ].map(v => {
          const val = String(v || "");
          return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
        }).join(","));
      }
    }
  }

  return [headers.join(","), ...lines].join("\n");
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
