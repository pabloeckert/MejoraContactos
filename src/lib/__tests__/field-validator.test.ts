import { describe, it, expect } from "vitest";
import { validateContactFields, validateContactBatch, getScoreColor, getFieldIcon } from "@/lib/field-validator";
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

describe("validateContactFields", () => {
  it("should score a perfect contact high", () => {
    const result = validateContactFields(makeContact());
    expect(result.overallScore).toBeGreaterThanOrEqual(80);
    expect(result.needsReview).toBe(false);
  });

  it("should score empty contact low", () => {
    const result = validateContactFields(makeContact({
      firstName: "", lastName: "", email: "", whatsapp: "", company: "", jobTitle: "",
    }));
    expect(result.overallScore).toBeLessThan(60);
    expect(result.needsReview).toBe(true);
  });

  it("should reject numbers in firstName", () => {
    const result = validateContactFields(makeContact({ firstName: "Juan123" }));
    const firstNameVal = result.validations.find(v => v.field === "firstName");
    expect(firstNameVal?.isValid).toBe(false);
  });

  it("should reject email in firstName field", () => {
    const result = validateContactFields(makeContact({ firstName: "juan@gmail.com" }));
    const firstNameVal = result.validations.find(v => v.field === "firstName");
    expect(firstNameVal?.isValid).toBe(false);
  });

  it("should detect company words in firstName", () => {
    const result = validateContactFields(makeContact({ firstName: "TechCorp SA" }));
    const firstNameVal = result.validations.find(v => v.field === "firstName");
    expect(firstNameVal?.isValid).toBe(false);
  });

  it("should detect title words in firstName", () => {
    const result = validateContactFields(makeContact({ firstName: "Director Juan" }));
    const firstNameVal = result.validations.find(v => v.field === "firstName");
    expect(firstNameVal?.isValid).toBe(false);
  });

  it("should reject lastName equal to firstName", () => {
    const result = validateContactFields(makeContact({ firstName: "Juan", lastName: "Juan" }));
    const lastNameVal = result.validations.find(v => v.field === "lastName");
    expect(lastNameVal?.isValid).toBe(false);
  });

  it("should reject invalid email format", () => {
    const result = validateContactFields(makeContact({ email: "not-email" }));
    const emailVal = result.validations.find(v => v.field === "email");
    expect(emailVal?.isValid).toBe(false);
  });

  it("should flag disposable email domain", () => {
    const result = validateContactFields(makeContact({ email: "test@mailinator.com" }));
    const emailVal = result.validations.find(v => v.field === "email");
    expect(emailVal?.isValid).toBe(false);
  });

  it("should suggest typo fix for email domain", () => {
    const result = validateContactFields(makeContact({ email: "test@gmal.com" }));
    const emailVal = result.validations.find(v => v.field === "email");
    expect(emailVal?.correctedValue).toBe("test@gmail.com");
  });

  it("should detect phone in company field", () => {
    const result = validateContactFields(makeContact({ company: "+5491155551234" }));
    const companyVal = result.validations.find(v => v.field === "company");
    expect(companyVal?.isValid).toBe(false);
  });

  it("should detect email in company field", () => {
    const result = validateContactFields(makeContact({ company: "test@test.com" }));
    const companyVal = result.validations.find(v => v.field === "company");
    expect(companyVal?.isValid).toBe(false);
  });

  it("should detect email in jobTitle field", () => {
    const result = validateContactFields(makeContact({ jobTitle: "test@test.com" }));
    const jobVal = result.validations.find(v => v.field === "jobTitle");
    expect(jobVal?.isValid).toBe(false);
  });

  it("should have 6 validations", () => {
    const result = validateContactFields(makeContact());
    expect(result.validations).toHaveLength(6);
  });

  it("should validate WhatsApp as valid", () => {
    const result = validateContactFields(makeContact({ whatsapp: "+5491155551234" }));
    const waVal = result.validations.find(v => v.field === "whatsapp");
    expect(waVal?.isValid).toBe(true);
    // Score depends on libphonenumber-js metadata: 95 for WhatsApp-compatible, 60 for valid-but-not-WA
    expect(waVal?.score).toBeGreaterThanOrEqual(60);
  });

  it("should score empty email at 50 (not invalid)", () => {
    const result = validateContactFields(makeContact({ email: "" }));
    const emailVal = result.validations.find(v => v.field === "email");
    expect(emailVal?.isValid).toBe(true);
    expect(emailVal?.score).toBe(50);
  });
});

describe("getScoreColor", () => {
  it("should return green for >= 90", () => {
    const color = getScoreColor(95);
    expect(color.bg).toBe("bg-green-100");
    expect(color.label).toBe("Excelente");
  });

  it("should return yellow for 60-89", () => {
    const color = getScoreColor(75);
    expect(color.bg).toBe("bg-yellow-100");
    expect(color.label).toBe("Observaciones");
  });

  it("should return red for < 60", () => {
    const color = getScoreColor(30);
    expect(color.bg).toBe("bg-red-100");
    expect(color.label).toBe("Revisar");
  });
});

describe("getFieldIcon", () => {
  it("should return ✅ for valid high score", () => {
    expect(getFieldIcon({ field: "firstName", isValid: true, score: 95 })).toBe("✅");
  });

  it("should return ❌ for invalid", () => {
    expect(getFieldIcon({ field: "firstName", isValid: false, score: 10 })).toBe("❌");
  });

  it("should return ⚠️ for valid but low score", () => {
    expect(getFieldIcon({ field: "firstName", isValid: true, score: 60 })).toBe("⚠️");
  });
});

describe("validateContactFields — extended coverage", () => {
  it("should reject too long firstName (>50 chars)", () => {
    const result = validateContactFields(makeContact({ firstName: "A".repeat(51) }));
    const val = result.validations.find(v => v.field === "firstName");
    expect(val?.isValid).toBe(false);
    expect(val?.score).toBe(20);
  });

  it("should reject short acronym without vowels", () => {
    const result = validateContactFields(makeContact({ firstName: "DR" }));
    const val = result.validations.find(v => v.field === "firstName");
    expect(val?.isValid).toBe(false);
    expect(val?.score).toBe(5);
  });

  it("should suggest split for full name in firstName", () => {
    const result = validateContactFields(makeContact({ firstName: "Juan García", lastName: "" }));
    const val = result.validations.find(v => v.field === "firstName");
    expect(val?.isValid).toBe(true);
    expect(val?.score).toBe(70);
    expect(val?.correctedValue).toBe("Juan");
  });

  it("should handle empty firstName with full name in lastName context", () => {
    const result = validateContactFields(makeContact({ firstName: "Juan García", lastName: "" }));
    const lastNameVal = result.validations.find(v => v.field === "lastName");
    expect(lastNameVal?.score).toBe(30);
  });

  it("should reject company that looks like person name", () => {
    const result = validateContactFields(makeContact({ company: "Juan García" }));
    const val = result.validations.find(v => v.field === "company");
    expect(val?.score).toBe(40);
  });

  it("should reject title word in company field", () => {
    const result = validateContactFields(makeContact({ company: "CEO" }));
    const val = result.validations.find(v => v.field === "company");
    expect(val?.isValid).toBe(false);
    expect(val?.score).toBe(10);
  });

  it("should reject vague job title", () => {
    const result = validateContactFields(makeContact({ jobTitle: "empleado" }));
    const val = result.validations.find(v => v.field === "jobTitle");
    expect(val?.isValid).toBe(false);
    expect(val?.score).toBe(15);
  });

  it("should detect phone in jobTitle field", () => {
    const result = validateContactFields(makeContact({ jobTitle: "+5491155551234" }));
    const val = result.validations.find(v => v.field === "jobTitle");
    expect(val?.isValid).toBe(false);
    expect(val?.score).toBe(5);
  });

  it("should handle empty whatsapp", () => {
    const result = validateContactFields(makeContact({ whatsapp: "" }));
    const val = result.validations.find(v => v.field === "whatsapp");
    expect(val?.isValid).toBe(true);
    expect(val?.score).toBe(50);
  });

  it("should handle role email prefix", () => {
    const result = validateContactFields(makeContact({ email: "info@company.com" }));
    const val = result.validations.find(v => v.field === "email");
    expect(val?.isValid).toBe(true);
    expect(val?.score).toBe(60);
  });

  it("should reject domain without dot in email", () => {
    const result = validateContactFields(makeContact({ email: "test@gmailcom" }));
    const val = result.validations.find(v => v.field === "email");
    expect(val?.isValid).toBe(false);
    // Fails basic regex (no dot after @), so score is 0
    expect(val?.score).toBe(0);
  });

  it("should reject email in lastName field", () => {
    const result = validateContactFields(makeContact({ lastName: "test@email.com" }));
    const val = result.validations.find(v => v.field === "lastName");
    expect(val?.isValid).toBe(false);
    expect(val?.score).toBe(0);
  });

  it("should reject junk lastName", () => {
    const result = validateContactFields(makeContact({ lastName: "n/a" }));
    const val = result.validations.find(v => v.field === "lastName");
    expect(val?.isValid).toBe(false);
    expect(val?.score).toBe(0);
  });

  it("should validate compound lastName", () => {
    const result = validateContactFields(makeContact({ lastName: "García-López" }));
    const val = result.validations.find(v => v.field === "lastName");
    expect(val?.isValid).toBe(true);
    expect(val?.score).toBe(95);
  });
});

describe("validateContactBatch", () => {
  it("should validate multiple contacts", () => {
    const contacts = [
      makeContact({ id: "1", firstName: "Juan" }),
      makeContact({ id: "2", firstName: "Ana" }),
      makeContact({ id: "3", firstName: "" }),
    ];
    const results = validateContactBatch(contacts);
    expect(results).toHaveLength(3);
    expect(results[0].contactId).toBe("1");
    expect(results[1].contactId).toBe("2");
    expect(results[2].contactId).toBe("3");
  });

  it("should handle empty array", () => {
    expect(validateContactBatch([])).toHaveLength(0);
  });

  it("should validate a local-format phone correctly regardless of its position in the batch", () => {
    // Regresión: contacts.map(validateContactFields) le pasaba el índice del
    // array como defaultCountry (map llama al callback con (item, index,
    // array)). Un número que necesita el defaultCountry 'AR' para parsear
    // (formato local, sin +54) solo valida bien si el índice NO pisó ese
    // parámetro — por eso este contacto va en la posición 1, no la 0.
    const contacts = [
      makeContact({ id: "0" }),
      makeContact({ id: "1", whatsapp: "0111555551234" }), // formato local AR, sin +54
      makeContact({ id: "2" }),
    ];
    const results = validateContactBatch(contacts);
    const whatsappVal = results[1].validations.find(v => v.field === "whatsapp");
    expect(whatsappVal?.isValid).toBe(true);
    expect(whatsappVal?.score).toBeGreaterThan(0);
  });
});
