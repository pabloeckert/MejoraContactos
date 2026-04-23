import Papa from "papaparse";
import type { ParsedFile, RawContact } from "@/types/contact";

function genId(): string {
  return crypto.randomUUID();
}

export function parseCSV(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete(results) {
        const rows = results.data as RawContact[];
        resolve({
          id: genId(),
          name: file.name,
          size: file.size,
          type: "CSV",
          rows,
          columns: results.meta.fields || [],
          addedAt: new Date(),
        });
      },
      error: (err) => reject(err),
    });
  });
}

export async function parseExcel(file: File): Promise<ParsedFile> {
  const XLSX = await import("xlsx");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: RawContact[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        resolve({
          id: genId(),
          name: file.name,
          size: file.size,
          type: "Excel",
          rows,
          columns,
          addedAt: new Date(),
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function parseVCF(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target!.result as string;
        const contacts: RawContact[] = [];
        const vcards = text.split("BEGIN:VCARD").filter((v) => v.trim());

        for (const vcard of vcards) {
          const contact: RawContact = {};
          const lines = vcard.split(/\r?\n/);

          for (const line of lines) {
            if (line.startsWith("FN:") || line.startsWith("FN;")) {
              // FN:John Doe → "John Doe"
              // FN;CHARSET=UTF-8:John Doe → "John Doe"
              const colonIdx = line.indexOf(":");
              contact["Full Name"] = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : "";
            }
            if (line.startsWith("N:") || line.startsWith("N;")) {
              // N:García;Juan;;Dr; → parts = ["García", "Juan", "", "Dr", ""]
              const colonIdx = line.indexOf(":");
              const val = colonIdx >= 0 ? line.slice(colonIdx + 1) : "";
              const parts = val.split(";");
              contact["Last Name"] = parts[0]?.trim() || "";
              contact["First Name"] = parts[1]?.trim() || "";
            }
            // TEL;TYPE=CELL:+54911... or TEL:+54911...
            if (line.startsWith("TEL") && line.includes(":")) {
              const colonIdx = line.indexOf(":");
              const val = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : "";
              if (val) {
                const isCell = line.toUpperCase().includes("CELL") || line.toUpperCase().includes("MOBILE");
                if (!contact["Phone"]) {
                  contact["Phone"] = val;
                  if (isCell) contact["Phone Type"] = "CELL";
                } else if (!contact["Phone 2"]) {
                  contact["Phone 2"] = val;
                }
              }
            }
            // EMAIL;TYPE=INTERNET:... or EMAIL:...
            if (line.startsWith("EMAIL") && line.includes(":")) {
              const colonIdx = line.indexOf(":");
              const val = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : "";
              if (val) contact["Email"] = val;
            }
            // ORG:Company;Department
            if (line.startsWith("ORG") && line.includes(":")) {
              const colonIdx = line.indexOf(":");
              const val = colonIdx >= 0 ? line.slice(colonIdx + 1).replace(/;/g, " ").trim() : "";
              if (val) contact["Company"] = val;
            }
            // TITLE:Job Title
            if (line.startsWith("TITLE") && line.includes(":")) {
              const colonIdx = line.indexOf(":");
              const val = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : "";
              if (val) contact["Job Title"] = val;
            }
            // NOTE:...
            if (line.startsWith("NOTE") && line.includes(":")) {
              const colonIdx = line.indexOf(":");
              const val = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : "";
              if (val) contact["Notes"] = val;
            }
          }

          if (Object.keys(contact).length > 0) {
            contacts.push(contact);
          }
        }

        const columns = [...new Set(contacts.flatMap((c) => Object.keys(c)))];
        resolve({
          id: genId(),
          name: file.name,
          size: file.size,
          type: "VCF",
          rows: contacts,
          columns,
          addedAt: new Date(),
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function parseJSON(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let data: unknown = JSON.parse(e.target!.result as string);
        if (!Array.isArray(data)) {
          data = Object.values(data as Record<string, unknown>).find(Array.isArray) || [data];
        }
        const rows: RawContact[] = (data as unknown[]).map((item) => {
          const row: RawContact = {};
          for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
            row[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
          }
          return row;
        });
        const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        resolve({
          id: genId(),
          name: file.name,
          size: file.size,
          type: "JSON",
          rows,
          columns,
          addedAt: new Date(),
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.toLowerCase().split(".").pop();
  switch (ext) {
    case "csv":
    case "txt":
      return parseCSV(file);
    case "xlsx":
    case "xls":
      return parseExcel(file);
    case "vcf":
      return parseVCF(file);
    case "json":
      return parseJSON(file);
    default:
      throw new Error(`Formato no soportado: .${ext}`);
  }
}
