/**
 * Web Worker for CPU-intensive pipeline operations.
 * Handles batchRuleClean + dedup off the main thread
 * to keep UI responsive with 50K+ records.
 */

// Inline minimal dependencies to avoid import issues in worker context

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim();
}

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;
  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let matches = 0;
  let transpositions = 0;
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

// --- Rule cleaner (inline) ---

const JUNK = new Set([
  "n/a", "na", "n.a.", "none", "null", "undefined", "-", "--", "---",
  ".", "..", "...", "xxx", "xxxx", "test", "prueba", "aaa", "asdf",
  "sin dato", "sin datos", "no tiene", "no aplica", "desconocido",
]);

function cleanJunk(val: string): string {
  const lower = val.toLowerCase().trim();
  if (JUNK.has(lower) || lower.length < 2) return "";
  return val.trim();
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(?:^|\s|[-'])\S/g, (c) => c.toUpperCase()).trim();
}

function cleanEmail(email: string): string {
  const cleaned = email.toLowerCase().trim().replace(/\s+/g, "");
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return cleaned;
  return "";
}

function cleanPhoneSimple(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "";
  return digits.length >= 10 ? `+${digits}` : digits;
}

function autoSplitName(firstName: string, lastName: string): { firstName: string; lastName: string } {
  if (firstName && !lastName && firstName.includes(" ")) {
    const parts = firstName.trim().split(/\s+/);
    if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
    if (parts.length > 2) return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }
  return { firstName, lastName };
}

function extractHonorific(name: string): { prefix: string; cleanName: string } {
  const honorifics = /^(Dr|Dra|Ing|Lic|Prof|Sr|Sra|Srta|Mr|Mrs|Ms|Don|Doña)\.?\s+/i;
  const match = name.match(honorifics);
  if (match) return { prefix: match[1] + ".", cleanName: name.slice(match[0].length) };
  return { prefix: "", cleanName: name };
}

interface CleanResult {
  firstName: string;
  lastName: string;
  email: string;
  whatsapp: string;
  company: string;
  jobTitle: string;
  needsAI: boolean;
}

function ruleClean(contact: Record<string, string>): CleanResult {
  let firstName = cleanJunk(contact.firstName || "");
  let lastName = cleanJunk(contact.lastName || "");
  const email = cleanEmail(contact.email || "");
  const phone = cleanPhoneSimple(contact.whatsapp || "");
  const company = cleanJunk(contact.company || "");
  const jobTitle = cleanJunk(contact.jobTitle || "");

  const split = autoSplitName(firstName, lastName);
  firstName = split.firstName;
  lastName = split.lastName;

  if (firstName) {
    const { cleanName } = extractHonorific(firstName);
    firstName = cleanName;
  }

  let needsAI = false;
  if (/\d/.test(firstName + lastName)) needsAI = true;
  if (contact.whatsapp && !phone) needsAI = true;
  if (company && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(company)) needsAI = true;

  return {
    firstName: firstName ? titleCase(firstName) : "",
    lastName: lastName ? titleCase(lastName) : "",
    email,
    whatsapp: phone,
    company: company ? titleCase(company) : "",
    jobTitle: jobTitle ? titleCase(jobTitle) : "",
    needsAI,
  };
}

// --- Dedup (inline) ---

class DedupIndex {
  private emailIndex = new Map<string, string>();
  private phoneIndex = new Map<string, string>();
  private nameIndex = new Map<string, string>();
  private bucketIndex = new Map<string, Array<{ id: string; firstName: string; lastName: string; email: string; whatsapp: string }>>();
  private records: Array<{ id: string; firstName: string; lastName: string; email: string; whatsapp: string }> = [];

  add(contact: { id: string; firstName: string; lastName: string; email: string; whatsapp: string }): { isDuplicate: boolean; duplicateOf?: string; confidence: number } {
    const emailNorm = contact.email ? normalize(contact.email) : "";
    const phoneDigits = contact.whatsapp ? contact.whatsapp.replace(/\D/g, "").slice(-7) : "";
    const fullName = normalize(`${contact.firstName} ${contact.lastName}`);

    if (emailNorm && this.emailIndex.has(emailNorm)) {
      return { isDuplicate: true, duplicateOf: this.emailIndex.get(emailNorm), confidence: 100 };
    }
    if (phoneDigits && this.phoneIndex.has(phoneDigits)) {
      return { isDuplicate: true, duplicateOf: this.phoneIndex.get(phoneDigits), confidence: 95 };
    }
    if (fullName && fullName.length > 3 && this.nameIndex.has(fullName)) {
      return { isDuplicate: true, duplicateOf: this.nameIndex.get(fullName), confidence: 80 };
    }

    // Fuzzy name check optimizado con buckets de prefijo (O(k) en lugar de O(n^2))
    if (fullName.length >= 3) {
      const bucket = fullName.slice(0, 3);
      const candidates = this.bucketIndex.get(bucket) || [];
      for (const existing of candidates) {
        const existingFull = normalize(`${existing.firstName} ${existing.lastName}`);
        if (jaroWinkler(fullName, existingFull) > 0.92) {
          return { isDuplicate: true, duplicateOf: existing.id, confidence: 75 };
        }
      }
    }

    const record = { id: contact.id, firstName: contact.firstName, lastName: contact.lastName, email: contact.email, whatsapp: contact.whatsapp };
    this.records.push(record);
    if (emailNorm) this.emailIndex.set(emailNorm, contact.id);
    if (phoneDigits) this.phoneIndex.set(phoneDigits, contact.id);
    if (fullName) {
      this.nameIndex.set(fullName, contact.id);
      if (fullName.length >= 3) {
        const bucket = fullName.slice(0, 3);
        const list = this.bucketIndex.get(bucket) || [];
        list.push(record);
        this.bucketIndex.set(bucket, list);
      }
    }

    return { isDuplicate: false, confidence: 100 };
  }
}

// --- Worker message handler ---

interface WorkerRequest {
  type: "ruleClean" | "dedup";
  contacts: Array<Record<string, string>>;
  defaultCountry?: string;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { type, contacts } = e.data;

  try {
    if (type === "ruleClean") {
      const cleaned: CleanResult[] = [];
      const aiIndices: number[] = [];
      const BATCH_SIZE = 5000;

      for (let i = 0; i < contacts.length; i++) {
        const result = ruleClean(contacts[i]);
        cleaned.push(result);
        if (result.needsAI) aiIndices.push(i);

        // Progress update every BATCH_SIZE items
        if (i % BATCH_SIZE === 0 && i > 0) {
          (self as unknown as Worker).postMessage({
            type: "progress",
            processed: i,
            total: contacts.length,
          });
        }
      }

      (self as unknown as Worker).postMessage({
        type: "ruleClean:done",
        cleaned,
        aiIndices,
      });
    }

    if (type === "dedup") {
      const dedupIndex = new DedupIndex();
      const results: Array<{ id: string; isDuplicate: boolean; duplicateOf?: string; confidence: number }> = [];
      const BATCH_SIZE = 5000;

      for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i];
        const dedupResult = dedupIndex.add({
          id: c.id || String(i),
          firstName: c.firstName || "",
          lastName: c.lastName || "",
          email: c.email || "",
          whatsapp: c.whatsapp || "",
        });
        results.push({
          id: c.id || String(i),
          ...dedupResult,
        });

        if (i % BATCH_SIZE === 0 && i > 0) {
          (self as unknown as Worker).postMessage({
            type: "progress",
            processed: i,
            total: contacts.length,
          });
        }
      }

      (self as unknown as Worker).postMessage({
        type: "dedup:done",
        results,
      });
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
