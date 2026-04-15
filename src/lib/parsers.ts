import Papa from "papaparse";
import * as XLSX from "xlsx";
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

export function parseExcel(file: File): Promise<ParsedFile> {
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
              contact["Full Name"] = line.replace(/^FN[;:].*?:?/, "").replace(/^FN:/, "").trim();
              if (line.startsWith("FN:")) contact["Full Name"] = line.slice(3).trim();
            }
            if (line.startsWith("N:") || line.startsWith("N;")) {
              const val = line.startsWith("N:") ? line.slice(2) : line.split(":").slice(1).join(":");
              const parts = val.split(";");
              contact["Last Name"] = parts[0]?.trim() || "";
              contact["First Name"] = parts[1]?.trim() || "";
            }
            if (line.startsWith("TEL") && line.includes(":")) {
              const val = line.split(":").pop()?.trim() || "";
              if (!contact["Phone"]) contact["Phone"] = val;
              else contact["Phone 2"] = val;
            }
            if (line.startsWith("EMAIL") && line.includes(":")) {
              contact["Email"] = line.split(":").pop()?.trim() || "";
            }
            if (line.startsWith("ORG") && line.includes(":")) {
              contact["Company"] = line.split(":").pop()?.replace(/;/g, " ").trim() || "";
            }
            if (line.startsWith("TITLE") && line.includes(":")) {
              contact["Job Title"] = line.split(":").pop()?.trim() || "";
            }
            if (line.startsWith("NOTE") && line.includes(":")) {
              contact["Notes"] = line.split(":").pop()?.trim() || "";
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
        let data = JSON.parse(e.target!.result as string);
        if (!Array.isArray(data)) {
          data = Object.values(data).find(Array.isArray) || [data];
        }
        const rows: RawContact[] = data.map((item: any) => {
          const row: RawContact = {};
          for (const [k, v] of Object.entries(item)) {
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
