// Jaro-Winkler similarity for fuzzy dedup
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

  const jaro =
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export interface DedupResult {
  isDuplicate: boolean;
  duplicateOf?: string;
  confidence: number;
}

export function checkDuplicate(
  contact: { firstName: string; lastName: string; email: string; phone: string },
  existing: Array<{ id: string; firstName: string; lastName: string; email: string; phone: string }>,
  threshold = 0.88
): DedupResult {
  // Exact email match
  if (contact.email) {
    const emailMatch = existing.find(
      (e) => e.email && normalize(e.email) === normalize(contact.email)
    );
    if (emailMatch) {
      return { isDuplicate: true, duplicateOf: emailMatch.id, confidence: 100 };
    }
  }

  // Exact phone match
  if (contact.phone) {
    const cleanPhone = contact.phone.replace(/[^\d]/g, "");
    if (cleanPhone.length >= 7) {
      const phoneMatch = existing.find((e) => {
        const ep = e.phone.replace(/[^\d]/g, "");
        return ep.length >= 7 && (ep.endsWith(cleanPhone.slice(-7)) || cleanPhone.endsWith(ep.slice(-7)));
      });
      if (phoneMatch) {
        return { isDuplicate: true, duplicateOf: phoneMatch.id, confidence: 95 };
      }
    }
  }

  // Fuzzy name match
  const fullName = normalize(`${contact.firstName}${contact.lastName}`);
  if (fullName.length < 3) return { isDuplicate: false, confidence: 50 };

  for (const e of existing) {
    const eName = normalize(`${e.firstName}${e.lastName}`);
    if (eName.length < 3) continue;
    const sim = jaroWinkler(fullName, eName);
    if (sim >= threshold) {
      return { isDuplicate: true, duplicateOf: e.id, confidence: Math.round(sim * 100) };
    }
  }

  return { isDuplicate: false, confidence: 70 };
}
