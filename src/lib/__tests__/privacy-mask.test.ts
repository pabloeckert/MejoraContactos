import { describe, it, expect } from "vitest";
import { maskPhone, maskEmail, maskFreeText, maskContactForAI } from "../privacy-mask";

describe("privacy-mask", () => {
  it("enmascara teléfonos preservando sólo últimos 4 dígitos", () => {
    expect(maskPhone("+54 9 11 5555 1234")).toBe("****1234");
    expect(maskPhone("1144445555")).toBe("****5555");
    expect(maskPhone("123")).toBe("****");
    expect(maskPhone("****5555")).toBe("****5555"); // idempotente
    expect(maskPhone("")).toBe("");
    expect(maskPhone(null)).toBe("");
  });

  it("enmascara emails preservando sólo el dominio", () => {
    expect(maskEmail("pablo.eckert@empresa.com")).toBe("***@empresa.com");
    expect(maskEmail("usuario@GMAIL.COM")).toBe("***@gmail.com");
    expect(maskEmail("sin-arroba")).toBe("****");
    expect(maskEmail("")).toBe("");
  });

  it("enmascara texto libre con emails y teléfonos", () => {
    const texto = "Contactar a juan@acme.com o llamar al 11-5555-4444 para cerrar.";
    const enmascarado = maskFreeText(texto);
    expect(enmascarado).toContain("***@acme.com");
    expect(enmascarado).not.toContain("juan@acme.com");
    expect(enmascarado).not.toContain("5555-4444");
    expect(enmascarado).toContain("****4444");
  });

  it("enmascara contacto completo para envío a IA", () => {
    const contacto = {
      firstName: "Carlos",
      lastName: "Benitez",
      whatsapp: "+5491122334455",
      email: "carlos@acme.com",
      company: "Acme",
      jobTitle: "Gerente",
      notes: "Tel alternativo: 1144448888",
    };
    const seguro = maskContactForAI(contacto);
    expect(seguro.whatsapp).toBe("****4455");
    expect(seguro.email).toBe("***@acme.com");
    expect(seguro.notes).toContain("****8888");
    expect(seguro.firstName).toBe("Carlos");
    expect(seguro.lastName).toBe("Benitez");
  });
});
