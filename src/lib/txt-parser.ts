import { getActiveKeys } from "./api-keys";
import { handleParseError } from "./error-handler";
import type { ParsedFile, RawContact } from "@/types/contact";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `Eres un parser de contactos. Recibirás texto libre con datos de una persona de negocio.
Extrae SOLO los datos que existan. NO inventes ni inferas datos que no estén presentes.
Devuelve JSON con estos campos (omitir los vacíos):
firstName, lastName, company, jobTitle, email, phone, city, notes

Reglas:
- Si hay un email válido, va en email
- Si hay un número de teléfono, va en phone (formato original, se normalizará después)
- Si hay una empresa, va en company
- Si hay un cargo/rol laboral, va en jobTitle
- Si hay una ciudad o localidad, va en city
- El resto que no encaje en ningún campo va en notes
- Responde SOLO con el JSON, sin explicaciones`;

interface TxtContactResult {
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  city?: string;
  notes?: string;
}

function hasDelimiters(text: string): boolean {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return false;
  const first = lines[0];

  // Tab is an unambiguous delimiter
  if ((first.match(/\t/g) || []).length >= 1) return true;

  // For comma/semicolon/pipe: >= 2 in first line, OR consistent count across first two lines
  for (const delim of [",", ";", "|"]) {
    const re = new RegExp(`\\${delim}`, "g");
    const count1 = (first.match(re) || []).length;
    if (count1 >= 2) return true;
    if (count1 >= 1 && lines.length >= 2) {
      const count2 = (lines[1].match(re) || []).length;
      if (count1 === count2) return true;
    }
  }

  return false;
}

function extractFallback(text: string): TxtContactResult {
  const result: TxtContactResult = {};
  const emailMatch = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  if (emailMatch) result.email = emailMatch[0];
  const phoneMatch = text.match(/(?:\+?[\d\s\-().]{7,})/);
  if (phoneMatch) result.phone = phoneMatch[0].trim();
  result.notes = text.trim();
  return result;
}

export async function parseTxtContact(rawText: string): Promise<TxtContactResult> {
  if (!rawText.trim()) return {};

  const keys = getActiveKeys();
  const apiKey = keys["groq"];

  if (!apiKey) {
    return extractFallback(rawText);
  }

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: rawText },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      return extractFallback(rawText);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return extractFallback(rawText);

    return JSON.parse(content) as TxtContactResult;
  } catch {
    return extractFallback(rawText);
  }
}

function resultToRaw(r: TxtContactResult): RawContact {
  const row: RawContact = {};
  if (r.firstName) row["First Name"] = r.firstName;
  if (r.lastName) row["Last Name"] = r.lastName;
  if (r.email) row["Email"] = r.email;
  if (r.phone) row["Phone"] = r.phone;
  if (r.company) row["Company"] = r.company;
  if (r.jobTitle) row["Job Title"] = r.jobTitle;
  if (r.city) row["City"] = r.city;
  if (r.notes) row["Notes"] = r.notes;
  return row;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsText(file, "utf-8");
  });
}

export async function parseTxt(file: File): Promise<ParsedFile> {
  const text = await readFileAsText(file);

  if (hasDelimiters(text)) {
    const Papa = (await import("papaparse")).default;
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete(results) {
          const rows = results.data as RawContact[];
          resolve({
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            type: "TXT",
            rows,
            columns: results.meta.fields || [],
            addedAt: new Date(),
          });
        },
        error: (err) => reject(err),
      });
    });
  }

  // Split into blocks on double newlines; fall back to single lines
  const rawBlocks = text.split(/\n{2,}/).map(b => b.trim()).filter(b => b.length > 0);
  const blocks = rawBlocks.length > 1 ? rawBlocks : text.split(/\r?\n/).map(b => b.trim()).filter(b => b.length > 0);

  const rows: RawContact[] = [];
  try {
    for (const block of blocks) {
      const result = await parseTxtContact(block);
      const hasData = result.firstName || result.lastName || result.email || result.phone || result.company;
      if (hasData) rows.push(resultToRaw(result));
    }
  } catch (err) {
    handleParseError(err, file.name, "TXT");
    throw err;
  }

  const columns = rows.length > 0
    ? [...new Set(rows.flatMap(r => Object.keys(r)))]
    : ["First Name", "Last Name", "Email", "Phone", "Company", "Job Title", "City", "Notes"];

  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type: "TXT",
    rows,
    columns,
    addedAt: new Date(),
  };
}
