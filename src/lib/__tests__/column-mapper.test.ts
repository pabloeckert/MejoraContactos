import { describe, it, expect } from "vitest";
import { autoDetectMappings } from "@/lib/column-mapper";

describe("autoDetectMappings", () => {
  it("should detect Spanish column names", () => {
    const mappings = autoDetectMappings(["Nombre", "Apellido", "Email", "Teléfono", "Empresa", "Cargo"]);
    const targets = Object.fromEntries(mappings.map(m => [m.source, m.target]));
    expect(targets["Nombre"]).toBe("firstName");
    expect(targets["Apellido"]).toBe("lastName");
    expect(targets["Email"]).toBe("email");
    expect(targets["Teléfono"]).toBe("whatsapp");
    expect(targets["Empresa"]).toBe("company");
    expect(targets["Cargo"]).toBe("jobTitle");
  });

  it("should detect English column names", () => {
    const mappings = autoDetectMappings(["First Name", "Last Name", "Email", "Phone", "Company", "Job Title"]);
    const targets = Object.fromEntries(mappings.map(m => [m.source, m.target]));
    expect(targets["First Name"]).toBe("firstName");
    expect(targets["Last Name"]).toBe("lastName");
    expect(targets["Email"]).toBe("email");
    expect(targets["Phone"]).toBe("whatsapp");
    expect(targets["Company"]).toBe("company");
    expect(targets["Job Title"]).toBe("jobTitle");
  });

  it("should detect camelCase variants", () => {
    const mappings = autoDetectMappings(["firstName", "lastName", "email"]);
    const targets = Object.fromEntries(mappings.map(m => [m.source, m.target]));
    expect(targets["firstName"]).toBe("firstName");
    expect(targets["lastName"]).toBe("lastName");
    expect(targets["email"]).toBe("email");
  });

  it("should map unknown columns to ignore", () => {
    const mappings = autoDetectMappings(["Nombre", "Notas", "Dirección"]);
    const targets = Object.fromEntries(mappings.map(m => [m.source, m.target]));
    expect(targets["Nombre"]).toBe("firstName");
    expect(targets["Notas"]).toBe("notes");
    expect(targets["Dirección"]).toBe("ignore");
  });

  it("should detect city and origin aliases", () => {
    const mappings = autoDetectMappings(["ciudad", "origen", "notas"]);
    const targets = Object.fromEntries(mappings.map(m => [m.source, m.target]));
    expect(targets["ciudad"]).toBe("city");
    expect(targets["origen"]).toBe("origin");
    expect(targets["notas"]).toBe("notes");
  });

  it("should detect various phone aliases", () => {
    const columns = ["celular", "cel", "whatsapp", "wsp", "wa", "mobile"];
    for (const col of columns) {
      const mappings = autoDetectMappings([col]);
      expect(mappings[0].target).toBe("whatsapp");
    }
  });

  it("should not map same target twice", () => {
    const mappings = autoDetectMappings(["Nombre", "Name", "First Name"]);
    const firstNameMappings = mappings.filter(m => m.target === "firstName");
    expect(firstNameMappings).toHaveLength(1);
  });

  it("should handle empty columns", () => {
    const mappings = autoDetectMappings([]);
    expect(mappings).toHaveLength(0);
  });

  it("should detect surname alias", () => {
    const mappings = autoDetectMappings(["surname"]);
    expect(mappings[0].target).toBe("lastName");
  });

  it("should detect organization alias", () => {
    const mappings = autoDetectMappings(["organization"]);
    expect(mappings[0].target).toBe("company");
  });
});
