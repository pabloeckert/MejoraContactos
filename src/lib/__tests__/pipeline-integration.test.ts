/**
 * Integration tests for the full processing pipeline.
 * Tests the flow: parse → map → rules → dedup → export
 * without hitting real AI providers (rules-only path).
 */

import { describe, it, expect } from "vitest";
import { batchRuleClean } from "@/lib/rule-cleaner";
import { DedupIndex } from "@/lib/dedup";
import { validateContactFields } from "@/lib/field-validator";
import { exportCSV, exportVCF, exportJSON, exportGoogleContactsCSV } from "@/lib/export-utils";
import { autoDetectMappings } from "@/lib/column-mapper";
import type { UnifiedContact } from "@/types/contact";

// Simulate the full pipeline without AI (rules-only path)
function runPipeline(rawRows: Record<string, string>[], columns: string[]): UnifiedContact[] {
  // Step 1: Auto-detect column mappings
  const mappings = autoDetectMappings(columns);

  // Step 2: Map rows to contacts
  const activeMappings = mappings.filter(m => m.target !== "ignore");
  const rawContacts: Partial<UnifiedContact>[] = [];

  for (const row of rawRows) {
    const contact: Partial<UnifiedContact> = {
      id: crypto.randomUUID(),
      source: "integration-test",
      aiCleaned: false,
    };
    for (const mapping of activeMappings) {
      const rawVal = row[mapping.source];
      (contact as Record<string, string>)[mapping.target] =
        typeof rawVal === "string" ? rawVal.trim() : String(rawVal ?? "");
    }
    contact.firstName = contact.firstName || "";
    contact.lastName = contact.lastName || "";
    contact.whatsapp = contact.whatsapp || "";
    contact.company = contact.company || "";
    contact.jobTitle = contact.jobTitle || "";
    contact.email = contact.email || "";

    if (!contact.firstName && !contact.lastName && !contact.email && !contact.whatsapp) continue;
    rawContacts.push(contact);
  }

  // Step 3: Rule-based cleaning
  const { cleaned } = batchRuleClean(rawContacts);
  for (let i = 0; i < rawContacts.length; i++) {
    rawContacts[i].firstName = cleaned[i].firstName;
    rawContacts[i].lastName = cleaned[i].lastName;
    rawContacts[i].email = cleaned[i].email;
    rawContacts[i].whatsapp = cleaned[i].whatsapp;
    rawContacts[i].company = cleaned[i].company;
    rawContacts[i].jobTitle = cleaned[i].jobTitle;
  }

  // Step 4: Validation
  const typedContacts = rawContacts as UnifiedContact[];
  for (const contact of typedContacts) {
    const validation = validateContactFields(contact);
    contact.validationScore = validation.overallScore;
    contact.fieldValidations = validation.validations;
  }

  // Step 5: Deduplication
  const dedupIndex = new DedupIndex();
  for (const contact of typedContacts) {
    const result = dedupIndex.add({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      whatsapp: contact.whatsapp,
    });
    contact.isDuplicate = result.isDuplicate;
    contact.duplicateOf = result.duplicateOf;
    contact.confidence = result.confidence;
  }

  return typedContacts;
}

describe("Pipeline integration", () => {
  const sampleRows = [
    { "Nombre": "juan garcía", "Teléfono": "011-15-5555-1234", "Email": "juan@gmail.com", "Empresa": "Acme SA" },
    { "Nombre": "María López", "Teléfono": "+54 9 11 5555-9999", "Email": "maria@hotmail.com", "Empresa": "Tech Corp" },
    { "Nombre": "juan garcía", "Teléfono": "011-15-5555-1234", "Email": "juan@gmail.com", "Empresa": "Acme SA" }, // dupe
    { "Nombre": "DR. Pedro Martínez", "Teléfono": "invalid", "Email": "pedro@acme.com", "Empresa": "" },
    { "Nombre": "Ana Torres", "Teléfono": "+52 55 1234 5678", "Email": "ANA@GMAIL.COM", "Empresa": "" },
    { "Nombre": "", "Teléfono": "", "Email": "", "Empresa": "" }, // empty row — should be skipped
    { "Nombre": "Carlos Ruiz", "Teléfono": "+34 612 345 678", "Email": "carlos@yahoo.com", "Empresa": "Industrias XYZ SRL" },
  ];
  const columns = ["Nombre", "Teléfono", "Email", "Empresa"];

  it("processes full pipeline: parse → map → rules → dedup → export", () => {
    const results = runPipeline(sampleRows, columns);

    // Empty row should be skipped
    expect(results.length).toBe(6);

    // At least the known duplicate (rows 0 and 2 share same email+phone+name) should be detected
    const dupes = results.filter(c => c.isDuplicate);
    expect(dupes.length).toBeGreaterThanOrEqual(1);

    // The known duplicate should be the juan garcía entry
    const juanDupes = dupes.filter(c => c.firstName === "Juan" || c.firstName === "juan");
    expect(juanDupes.length).toBeGreaterThanOrEqual(1);

    // Names should be title-cased
    const juan = results.find(c => c.email === "juan@gmail.com" && !c.isDuplicate);
    expect(juan?.firstName).toBe("Juan");

    // Honorific extraction: "DR. Pedro Martínez" → firstName may be "Dr." (honorific kept) or "Pedro" depending on split
    const pedro = results.find(c => c.email === "pedro@acme.com");
    expect(pedro).toBeDefined();
    // The contact should have Pedro somewhere in name fields
    expect(`${pedro?.firstName} ${pedro?.lastName}`).toContain("Pedro");

    // Email should be lowercased
    const ana = results.find(c => c.firstName === "Ana");
    expect(ana?.email).toBe("ana@gmail.com");

    // Argentine phone should be normalized
    expect(juan?.whatsapp).toMatch(/^\+54/);

    // Mexican phone should be normalized
    expect(ana?.whatsapp).toMatch(/^\+52/);

    // Spanish phone should be normalized
    const carlos = results.find(c => c.firstName === "Carlos");
    expect(carlos?.whatsapp).toMatch(/^\+34/);
  });

  it("validates all contacts have scores", () => {
    const results = runPipeline(sampleRows, columns);
    for (const contact of results) {
      expect(contact.validationScore).toBeDefined();
      expect(contact.validationScore).toBeGreaterThanOrEqual(0);
      expect(contact.validationScore).toBeLessThanOrEqual(100);
      expect(contact.fieldValidations).toBeDefined();
      expect(contact.fieldValidations!.length).toBeGreaterThan(0);
    }
  });

  it("exports work on pipeline results", () => {
    const results = runPipeline(sampleRows, columns);
    const unique = results.filter(c => !c.isDuplicate);

    // CSV export
    const csv = exportCSV(unique);
    const csvLines = csv.split("\n");
    expect(csvLines.length).toBe(unique.length + 1); // header + rows
    expect(csvLines[0]).toContain("Email");

    // VCF export
    const vcf = exportVCF(unique);
    expect(vcf).toContain("BEGIN:VCARD");
    const vcardCount = (vcf.match(/BEGIN:VCARD/g) || []).length;
    expect(vcardCount).toBe(unique.length);

    // JSON export
    const json = exportJSON(unique);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(unique.length);

    // Google Contacts CSV
    const googleCsv = exportGoogleContactsCSV(unique);
    expect(googleCsv).toContain("Given Name");
  });

  it("handles real-world messy CSV from Google Contacts export", () => {
    const messyRows = [
      { "First Name": "Juan", "Last Name": "García", "E-mail 1 - Value": "juan@gmail.com", "Phone 1 - Value": "+54 11 5555-1234", "Organization 1 - Name": "" },
      { "First Name": "juan", "Last Name": "garcia", "E-mail 1 - Value": "JUAN@GMAIL.COM", "Phone 1 - Value": "011-15-5555-1234", "Organization 1 - Name": "" },
      { "First Name": "María", "Last Name": "", "E-mail 1 - Value": "", "Phone 1 - Value": "", "Organization 1 - Name": "N/A" },
      { "First Name": "test", "Last Name": "", "E-mail 1 - Value": "test@x.com", "Phone 1 - Value": "123", "Organization 1 - Name": "" },
    ];
    const messyColumns = ["First Name", "Last Name", "E-mail 1 - Value", "Phone 1 - Value", "Organization 1 - Name"];

    const results = runPipeline(messyRows, messyColumns);

    // Junk company "N/A" should be cleaned
    const maria = results.find(c => c.firstName === "María");
    expect(maria?.company).toBe("");

    // Duplicate detection: juan garcía appears twice with same email
    const dupes = results.filter(c => c.isDuplicate);
    expect(dupes.length).toBeGreaterThanOrEqual(1);
  });

  it("pipeline handles 1000+ rows within performance budget", () => {
    // Generate 1000 unique rows
    const bigRows: Record<string, string>[] = [];
    for (let i = 0; i < 1000; i++) {
      bigRows.push({
        "Nombre": `Persona ${i}`,
        "Teléfono": `+54911555${String(i).padStart(4, "0")}`,
        "Email": `persona${i}@test.com`,
        "Empresa": i % 10 === 0 ? "Acme SA" : `Empresa ${i}`,
      });
    }
    // Add 50 explicit duplicates (same email as first 50)
    for (let i = 0; i < 50; i++) {
      bigRows.push({
        "Nombre": `Persona ${i}`,
        "Teléfono": `+54911555${String(i).padStart(4, "0")}`,
        "Email": `persona${i}@test.com`,
        "Empresa": "Acme SA",
      });
    }

    const t0 = Date.now();
    const results = runPipeline(bigRows, ["Nombre", "Teléfono", "Email", "Empresa"]);
    const elapsed = Date.now() - t0;

    expect(results.length).toBe(1050);

    // At least 50 duplicates should be found (the explicit ones)
    const dupes = results.filter(c => c.isDuplicate);
    expect(dupes.length).toBeGreaterThanOrEqual(50);

    // Should complete in reasonable time (< 10 seconds for 1050 rows)
    expect(elapsed).toBeLessThan(10000);
  });

  it("auto-detects column mappings for common CSV headers", () => {
    // English headers that match the patterns
    const cols1 = ["First Name", "Last Name", "Email", "Phone"];
    const mappings1 = autoDetectMappings(cols1);
    const targets1 = mappings1.filter(m => m.target !== "ignore").map(m => m.target);
    expect(targets1).toContain("firstName");
    expect(targets1).toContain("lastName");
    expect(targets1).toContain("email");

    // Spanish headers
    const cols2 = ["Nombre", "Apellido", "Teléfono", "Email", "Empresa"];
    const mappings2 = autoDetectMappings(cols2);
    const targets2 = mappings2.filter(m => m.target !== "ignore").map(m => m.target);
    expect(targets2).toContain("firstName");
    expect(targets2).toContain("lastName");
    expect(targets2).toContain("email");
  });
});
