import { describe, it, expect } from "vitest";
import { exportCSV, exportVCF, exportJSON, generateHTMLReport } from "@/lib/export-utils";
import type { UnifiedContact } from "@/types/contact";

function makeContact(overrides: Partial<UnifiedContact> = {}): UnifiedContact {
  return {
    id: "test-1",
    firstName: "Juan",
    lastName: "García",
    whatsapp: "+5491155551234",
    company: "Tech SA",
    jobTitle: "CEO",
    email: "juan@gmail.com",
    source: "test.csv",
    isDuplicate: false,
    confidence: 100,
    aiCleaned: false,
    ...overrides,
  };
}

describe("exportCSV", () => {
  it("should generate CSV with headers", () => {
    const csv = exportCSV([makeContact()]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Nombre,Apellido,WhatsApp,Empresa,Cargo,Email");
    expect(lines[1]).toContain("Juan");
    expect(lines[1]).toContain("García");
  });

  it("should escape commas in values", () => {
    const csv = exportCSV([makeContact({ company: "Tech, SA" })]);
    expect(csv).toContain('"Tech, SA"');
  });

  it("should escape quotes in values", () => {
    const csv = exportCSV([makeContact({ company: 'Tech "SA"' })]);
    expect(csv).toContain('"Tech ""SA"""');
  });

  it("should handle empty contacts", () => {
    const csv = exportCSV([]);
    expect(csv).toBe("");
  });
});

describe("exportVCF", () => {
  it("should generate vCard 3.0", () => {
    const vcf = exportVCF([makeContact()]);
    expect(vcf).toContain("BEGIN:VCARD");
    expect(vcf).toContain("VERSION:3.0");
    expect(vcf).toContain("N:García;Juan;;;");
    expect(vcf).toContain("FN:Juan García");
    expect(vcf).toContain("TEL;TYPE=CELL:+5491155551234");
    expect(vcf).toContain("EMAIL;TYPE=INTERNET:juan@gmail.com");
    expect(vcf).toContain("ORG:Tech SA");
    expect(vcf).toContain("TITLE:CEO");
    expect(vcf).toContain("END:VCARD");
  });

  it("should handle multiple contacts", () => {
    const vcf = exportVCF([makeContact(), makeContact({ id: "2", firstName: "María" })]);
    const count = (vcf.match(/BEGIN:VCARD/g) || []).length;
    expect(count).toBe(2);
  });

  it("should omit empty fields", () => {
    const vcf = exportVCF([makeContact({ email: "", company: "" })]);
    expect(vcf).not.toContain("EMAIL");
    expect(vcf).not.toContain("ORG");
  });
});

describe("exportJSON", () => {
  it("should produce valid JSON", () => {
    const json = exportJSON([makeContact()]);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].firstName).toBe("Juan");
  });
});

describe("generateHTMLReport", () => {
  it("should contain key sections", () => {
    const html = generateHTMLReport([makeContact()]);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Informe MejoraContactos");
    expect(html).toContain("Contactos únicos");
    expect(html).toContain("Duplicados");
    expect(html).toContain("Cobertura de campos");
  });

  it("should escape XSS in company names", () => {
    const html = generateHTMLReport([makeContact({ company: '<script>alert("xss")</script>' })]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("should escape XSS in source names", () => {
    const html = generateHTMLReport([makeContact({ source: '<img onerror="alert(1)" src=x>' })]);
    expect(html).not.toContain("<img onerror");
    expect(html).toContain("&lt;img");
  });

  it("should show top companies section", () => {
    const html = generateHTMLReport([
      makeContact({ company: "Tech SA" }),
      makeContact({ id: "2", company: "Tech SA" }),
      makeContact({ id: "3", company: "Other SA" }),
    ]);
    expect(html).toContain("Top 10 empresas");
    expect(html).toContain("Tech SA");
  });
});
