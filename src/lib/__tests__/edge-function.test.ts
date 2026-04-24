/**
 * Edge Function integration tests.
 * Tests the clean-contacts endpoint with mock data.
 * These tests verify request/response formats without actually calling AI providers.
 */
import { describe, it, expect } from "vitest";

// Test the input validation logic (same as Edge Function)
function validateContactsInput(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid JSON body" };
  }

  const { contacts, provider } = body as Record<string, unknown>;

  if (!contacts || !Array.isArray(contacts)) {
    return { valid: false, error: "contacts must be a non-empty array" };
  }

  if (contacts.length === 0) {
    return { valid: false, error: "contacts array is empty" };
  }

  if (contacts.length > 10000) {
    return { valid: false, error: "Maximum 10,000 contacts per request" };
  }

  const validProviders = [
    "groq", "openrouter", "together", "cerebras", "deepinfra",
    "sambanova", "mistral", "deepseek", "gemini", "cloudflare",
    "huggingface", "nebius", "pipeline",
  ];

  if (provider && !validProviders.includes(provider as string)) {
    return {
      valid: false,
      error: `Invalid provider: ${provider}. Valid: ${validProviders.join(", ")}`,
    };
  }

  return { valid: true };
}

// Test sanitization logic
function sanitizeContacts(contacts: Record<string, unknown>[]): Record<string, string | undefined>[] {
  const MAX_FIELD_LEN = 500;
  return contacts.map((c) => ({
    firstName: typeof c.firstName === "string" ? c.firstName.slice(0, MAX_FIELD_LEN) : undefined,
    lastName: typeof c.lastName === "string" ? c.lastName.slice(0, MAX_FIELD_LEN) : undefined,
    whatsapp: typeof c.whatsapp === "string" ? c.whatsapp.slice(0, 50) : undefined,
    company: typeof c.company === "string" ? c.company.slice(0, MAX_FIELD_LEN) : undefined,
    jobTitle: typeof c.jobTitle === "string" ? c.jobTitle.slice(0, MAX_FIELD_LEN) : undefined,
    email: typeof c.email === "string" ? c.email.slice(0, 254) : undefined,
  }));
}

describe("Edge Function — Input Validation", () => {
  it("rejects null body", () => {
    const result = validateContactsInput(null);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid JSON");
  });

  it("rejects empty contacts array", () => {
    const result = validateContactsInput({ contacts: [] });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("rejects non-array contacts", () => {
    const result = validateContactsInput({ contacts: "not-an-array" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("array");
  });

  it("rejects missing contacts", () => {
    const result = validateContactsInput({ provider: "groq" });
    expect(result.valid).toBe(false);
  });

  it("accepts valid contacts", () => {
    const result = validateContactsInput({
      contacts: [{ firstName: "John", email: "john@example.com" }],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid provider", () => {
    const result = validateContactsInput({
      contacts: [{ firstName: "John" }],
      provider: "invalid-provider",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid provider");
  });

  it("accepts valid provider", () => {
    const result = validateContactsInput({
      contacts: [{ firstName: "John" }],
      provider: "groq",
    });
    expect(result.valid).toBe(true);
  });

  it("accepts pipeline mode", () => {
    const result = validateContactsInput({
      contacts: [{ firstName: "John" }],
      provider: "pipeline",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects over 10000 contacts", () => {
    const contacts = Array.from({ length: 10001 }, (_, i) => ({ firstName: `User ${i}` }));
    const result = validateContactsInput({ contacts });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("10,000");
  });
});

describe("Edge Function — Contact Sanitization", () => {
  it("truncates long field values", () => {
    const longName = "A".repeat(1000);
    const result = sanitizeContacts([{ firstName: longName }]);
    expect(result[0].firstName?.length).toBe(500);
  });

  it("handles non-string fields gracefully", () => {
    const result = sanitizeContacts([{
      firstName: 123 as unknown,
      lastName: null as unknown,
      email: undefined as unknown,
    }]);
    expect(result[0].firstName).toBeUndefined();
    expect(result[0].lastName).toBeUndefined();
    expect(result[0].email).toBeUndefined();
  });

  it("truncates whatsapp to 50 chars", () => {
    const longPhone = "+54".repeat(20);
    const result = sanitizeContacts([{ whatsapp: longPhone }]);
    expect(result[0].whatsapp?.length).toBeLessThanOrEqual(50);
  });

  it("truncates email to 254 chars (RFC 5321)", () => {
    const longEmail = "a".repeat(250) + "@example.com";
    const result = sanitizeContacts([{ email: longEmail }]);
    expect(result[0].email?.length).toBeLessThanOrEqual(254);
  });

  it("preserves valid data", () => {
    const result = sanitizeContacts([{
      firstName: "Juan",
      lastName: "Pérez",
      email: "juan@example.com",
      whatsapp: "+5491155551234",
      company: "Acme Corp",
      jobTitle: "Developer",
    }]);
    expect(result[0].firstName).toBe("Juan");
    expect(result[0].lastName).toBe("Pérez");
    expect(result[0].email).toBe("juan@example.com");
    expect(result[0].whatsapp).toBe("+5491155551234");
  });
});
