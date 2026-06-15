import { describe, it, expect } from "vitest";
import { scoreRelevance, getSegment, scoreJobTitle } from "@/lib/relevance-scorer";
import type { UnifiedContact } from "@/types/contact";

function makeContact(overrides: Partial<UnifiedContact>): UnifiedContact {
  return {
    id: crypto.randomUUID(),
    firstName: "Juan",
    lastName: "García",
    whatsapp: "",
    company: "",
    jobTitle: "",
    email: "",
    source: "test",
    isDuplicate: false,
    confidence: 100,
    aiCleaned: false,
    ...overrides,
  };
}

describe("scoreJobTitle", () => {
  it("returns 40 for CEO", () => {
    expect(scoreJobTitle("CEO").score).toBe(40);
  });

  it("returns 40 for dueño (case insensitive)", () => {
    expect(scoreJobTitle("Dueño").score).toBe(40);
  });

  it("returns 40 for propietario", () => {
    expect(scoreJobTitle("Propietario").score).toBe(40);
  });

  it("returns 30 for gerente", () => {
    expect(scoreJobTitle("Gerente Comercial").score).toBe(30);
  });

  it("returns 30 for director", () => {
    expect(scoreJobTitle("Director de Marketing").score).toBe(30);
  });

  it("returns 15 for asesor", () => {
    expect(scoreJobTitle("Asesor Comercial").score).toBe(15);
  });

  it("returns 5 for pasante", () => {
    expect(scoreJobTitle("Pasante").score).toBe(5);
  });

  it("returns 0 for empty string", () => {
    expect(scoreJobTitle("").score).toBe(0);
  });

  it("returns 20 and needsAIScoring for unrecognized cargo", () => {
    const result = scoreJobTitle("Analista de Procesos Digitales");
    expect(result.score).toBe(20);
    expect(result.needsAIScoring).toBe(true);
  });
});

describe("scoreRelevance", () => {
  it("CEO con empresa y Posadas → score >= 70", () => {
    const c = makeContact({
      jobTitle: "CEO",
      company: "Empresa SA",
      city: "Posadas",
    });
    expect(scoreRelevance(c)).toBeGreaterThanOrEqual(70);
  });

  it("cargo vacío → score <= 30 (sin empresa ni ciudad)", () => {
    const c = makeContact({
      jobTitle: "",
      company: "",
      city: "",
    });
    expect(scoreRelevance(c)).toBeLessThanOrEqual(30);
  });

  it("pasante sin empresa → score <= 20", () => {
    const c = makeContact({
      jobTitle: "Pasante",
      company: "",
      city: "",
    });
    expect(scoreRelevance(c)).toBeLessThanOrEqual(20);
  });

  it("contacto completo con origen after office → score >= 80", () => {
    const c = makeContact({
      jobTitle: "CEO",
      company: "Tech Corp SA",
      city: "Posadas",
      origin: "after office",
    });
    expect(scoreRelevance(c)).toBeGreaterThanOrEqual(80);
  });

  it("cargo vacío aplica penalización de -10", () => {
    const noJob = makeContact({ jobTitle: "", company: "", city: "", origin: "" });
    const withJob = makeContact({ jobTitle: "asistente", company: "", city: "", origin: "" });
    expect(scoreRelevance(noJob)).toBeLessThan(scoreRelevance(withJob));
  });

  it("score nunca es negativo", () => {
    const c = makeContact({ jobTitle: "", company: "", city: "", origin: "" });
    expect(scoreRelevance(c)).toBeGreaterThanOrEqual(0);
  });

  it("score nunca supera 100", () => {
    const c = makeContact({
      jobTitle: "CEO",
      company: "Gran Empresa SA",
      city: "Posadas",
      origin: "after office networking",
    });
    expect(scoreRelevance(c)).toBeLessThanOrEqual(100);
  });

  it("empresa independiente no puntúa", () => {
    const c1 = makeContact({ jobTitle: "gerente", company: "independiente" });
    const c2 = makeContact({ jobTitle: "gerente", company: "Mi Empresa SA" });
    expect(scoreRelevance(c1)).toBeLessThan(scoreRelevance(c2));
  });

  it("ciudad Corrientes puntúa 20", () => {
    const c = makeContact({ jobTitle: "gerente", company: "Empresa", city: "Corrientes" });
    const score = scoreRelevance(c);
    expect(score).toBeGreaterThanOrEqual(50);
  });

  it("origen evento puntúa 10", () => {
    const cNoOrigin = makeContact({ jobTitle: "gerente", company: "Empresa SA", city: "Posadas" });
    const cWithOrigin = makeContact({ jobTitle: "gerente", company: "Empresa SA", city: "Posadas", origin: "evento networking" });
    expect(scoreRelevance(cWithOrigin)).toBeGreaterThan(scoreRelevance(cNoOrigin));
  });
});

describe("getSegment", () => {
  it("score 70 → A", () => expect(getSegment(70)).toBe("A"));
  it("score 100 → A", () => expect(getSegment(100)).toBe("A"));
  it("score 69 → B", () => expect(getSegment(69)).toBe("B"));
  it("score 40 → B", () => expect(getSegment(40)).toBe("B"));
  it("score 39 → C", () => expect(getSegment(39)).toBe("C"));
  it("score 0 → C", () => expect(getSegment(0)).toBe("C"));
});
