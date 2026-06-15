import { describe, it, expect } from "vitest";
import { parseCSV, parseVCF, parseJSON, parseFile } from "@/lib/parsers";

// Helper to create a File from text
function makeFile(content: string, name: string): File {
  return new File([content], name, { type: "text/plain" });
}

describe("parseCSV", () => {
  it("should parse CSV with headers", async () => {
    const csv = "Nombre,Apellido,Email\nJuan,García,juan@test.com\nMaría,López,maria@test.com";
    const result = await parseCSV(makeFile(csv, "test.csv"));
    expect(result.columns).toEqual(["Nombre", "Apellido", "Email"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]["Nombre"]).toBe("Juan");
    expect(result.name).toBe("test.csv");
    expect(result.type).toBe("CSV");
  });

  it("should skip empty lines", async () => {
    const csv = "A,B\n1,2\n\n3,4\n";
    const result = await parseCSV(makeFile(csv, "test.csv"));
    expect(result.rows).toHaveLength(2);
  });

  it("should handle single column", async () => {
    const csv = "Email\ntest@test.com\nfoo@bar.com";
    const result = await parseCSV(makeFile(csv, "test.csv"));
    expect(result.columns).toEqual(["Email"]);
    expect(result.rows).toHaveLength(2);
  });
});

describe("parseVCF", () => {
  it("should parse basic vCard", async () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
N:García;Juan;;;
FN:Juan García
TEL;TYPE=CELL:+5491155551234
EMAIL:juan@test.com
ORG:Tech SA
TITLE:CEO
END:VCARD`;
    const result = await parseVCF(makeFile(vcf, "test.vcf"));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]["First Name"]).toBe("Juan");
    expect(result.rows[0]["Last Name"]).toBe("García");
    expect(result.rows[0]["Phone"]).toBe("+5491155551234");
    expect(result.rows[0]["Email"]).toBe("juan@test.com");
    expect(result.rows[0]["Company"]).toBe("Tech SA");
    expect(result.rows[0]["Job Title"]).toBe("CEO");
  });

  it("should parse multiple vCards", async () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
N:A;B;;;
FN:B A
END:VCARD
BEGIN:VCARD
VERSION:3.0
N:C;D;;;
FN:D C
END:VCARD`;
    const result = await parseVCF(makeFile(vcf, "test.vcf"));
    expect(result.rows).toHaveLength(2);
  });

  it("should handle FN with CHARSET parameter", async () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
FN;CHARSET=UTF-8:Juan García
N:García;Juan;;;
END:VCARD`;
    const result = await parseVCF(makeFile(vcf, "test.vcf"));
    expect(result.rows[0]["Full Name"]).toBe("Juan García");
  });

  it("should handle multiple phones", async () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
N:A;B;;;
TEL;TYPE=CELL:+5491155551234
TEL;TYPE=HOME:+541144445555
END:VCARD`;
    const result = await parseVCF(makeFile(vcf, "test.vcf"));
    expect(result.rows[0]["Phone"]).toBe("+5491155551234");
    expect(result.rows[0]["Phone 2"]).toBe("+541144445555");
  });

  it("should handle TEL with colon in value", async () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
N:A;B;;;
TEL;TYPE=CELL:+5491155551234
END:VCARD`;
    const result = await parseVCF(makeFile(vcf, "test.vcf"));
    expect(result.rows[0]["Phone"]).toBe("+5491155551234");
  });
});

describe("parseJSON", () => {
  it("should parse JSON array", async () => {
    const json = JSON.stringify([
      { name: "Juan", email: "juan@test.com" },
      { name: "María", email: "maria@test.com" },
    ]);
    const result = await parseJSON(makeFile(json, "test.json"));
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]["name"]).toBe("Juan");
  });

  it("should handle object with nested array", async () => {
    const json = JSON.stringify({
      contacts: [
        { name: "Juan" },
        { name: "María" },
      ],
    });
    const result = await parseJSON(makeFile(json, "test.json"));
    expect(result.rows).toHaveLength(2);
  });

  it("should stringify nested objects", async () => {
    const json = JSON.stringify([{ name: "Juan", address: { city: "Buenos Aires" } }]);
    const result = await parseJSON(makeFile(json, "test.json"));
    expect(typeof result.rows[0]["address"]).toBe("string");
  });
});

describe("parseFile", () => {
  it("should route .csv to parseCSV", async () => {
    const csv = "A,B\n1,2";
    const result = await parseFile(makeFile(csv, "data.csv"));
    expect(result.type).toBe("CSV");
  });

  it("should route .txt to parseTxt (with delimiters → acts as CSV)", async () => {
    const txt = "A,B\n1,2";
    const result = await parseFile(makeFile(txt, "data.txt"));
    expect(result.type).toBe("TXT");
    expect(result.columns).toEqual(["A", "B"]);
    expect(result.rows).toHaveLength(1);
  });

  it("should route .vcf to parseVCF", async () => {
    const vcf = "BEGIN:VCARD\nVERSION:3.0\nN:A;B;;;\nEND:VCARD";
    const result = await parseFile(makeFile(vcf, "data.vcf"));
    expect(result.type).toBe("VCF");
  });

  it("should route .json to parseJSON", async () => {
    const json = JSON.stringify([{ a: 1 }]);
    const result = await parseFile(makeFile(json, "data.json"));
    expect(result.type).toBe("JSON");
  });

  it("should throw for unsupported format", async () => {
    await expect(parseFile(makeFile("data", "data.xml"))).rejects.toThrow("Formato no soportado: .xml");
  });
});

describe("parseCSV — extended coverage", () => {
  it("should handle CSV with BOM", async () => {
    const bom = "\uFEFF";
    const csv = "Nombre,Email\nJuan,juan@test.com";
    const result = await parseCSV(makeFile(bom + csv, "bom.csv"));
    expect(result.columns).toEqual(["Nombre", "Email"]);
    expect(result.rows).toHaveLength(1);
  });

  it("should handle CSV with quoted fields containing commas", async () => {
    const csv = 'Name,Note\nJuan,"Buenos Aires, Argentina"';
    const result = await parseCSV(makeFile(csv, "quoted.csv"));
    expect(result.rows[0]["Note"]).toBe("Buenos Aires, Argentina");
  });

  it("should handle CSV with different delimiters", async () => {
    const csv = "Name;Email\nJuan;juan@test.com";
    const result = await parseCSV(makeFile(csv, "semicolon.csv"));
    // PapaParse auto-detects delimiter
    expect(result.rows).toHaveLength(1);
  });
});

describe("parseVCF — extended coverage", () => {
  it("should handle vCard without N field (use FN)", async () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
FN:Juan García
EMAIL:juan@test.com
END:VCARD`;
    const result = await parseVCF(makeFile(vcf, "nofield.vcf"));
    expect(result.rows).toHaveLength(1);
  });

  it("should handle vCard with NOTE field", async () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
N:A;B;;;
NOTE:This is a note
END:VCARD`;
    const result = await parseVCF(makeFile(vcf, "note.vcf"));
    expect(result.rows).toHaveLength(1);
  });

  it("should handle empty vCard file", async () => {
    const vcf = "";
    const result = await parseVCF(makeFile(vcf, "empty.vcf"));
    expect(result.rows).toHaveLength(0);
    expect(result.columns).toHaveLength(0);
  });
});

describe("parseJSON — extended coverage", () => {
  it("should handle empty JSON array", async () => {
    const json = "[]";
    const result = await parseJSON(makeFile(json, "empty.json"));
    expect(result.rows).toHaveLength(0);
  });

  it("should handle nested object values by stringifying", async () => {
    const json = JSON.stringify([{ name: "Juan", meta: { age: 30, city: "BA" } }]);
    const result = await parseJSON(makeFile(json, "nested.json"));
    expect(typeof result.rows[0]["meta"]).toBe("string");
    const parsed = JSON.parse(result.rows[0]["meta"]);
    expect(parsed.age).toBe(30);
  });

  it("should handle array values by stringifying", async () => {
    const json = JSON.stringify([{ name: "Juan", tags: ["dev", "admin"] }]);
    const result = await parseJSON(makeFile(json, "array.json"));
    expect(typeof result.rows[0]["tags"]).toBe("string");
  });
});
