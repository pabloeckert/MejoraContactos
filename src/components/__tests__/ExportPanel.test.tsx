import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExportPanel } from "@/components/ExportPanel";
import type { UnifiedContact } from "@/types/contact";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/export-utils", () => ({
  exportCSV: vi.fn().mockReturnValue("csv-data"),
  exportExcel: vi.fn().mockReturnValue(new ArrayBuffer(8)),
  exportVCF: vi.fn().mockReturnValue("vcf-data"),
  exportJSON: vi.fn().mockReturnValue("{}"),
  generateHTMLReport: vi.fn().mockReturnValue("<html></html>"),
  downloadFile: vi.fn(),
}));

function makeContact(overrides?: Partial<UnifiedContact>): UnifiedContact {
  return {
    id: crypto.randomUUID(),
    firstName: "Juan",
    lastName: "García",
    whatsapp: "+5491155551234",
    company: "ACME",
    jobTitle: "Dev",
    email: "juan@test.com",
    source: "test.csv",
    isDuplicate: false,
    confidence: 100,
    aiCleaned: false,
    ...overrides,
  };
}

describe("ExportPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render stat cards", () => {
    const contacts = [makeContact(), makeContact({ isDuplicate: true })];
    render(<ExportPanel contacts={contacts} />);
    expect(screen.getByText("Limpios")).toBeTruthy();
    expect(screen.getByText("Descartados")).toBeTruthy();
  });

  it("should render standalone export format buttons", () => {
    render(<ExportPanel contacts={[makeContact()]} />);
    expect(screen.getByText("CSV")).toBeTruthy();
    expect(screen.getByText("Excel")).toBeTruthy();
    expect(screen.getByText("VCF")).toBeTruthy();
    expect(screen.getByText("JSON")).toBeTruthy();
    expect(screen.getByText("Informe")).toBeTruthy();
  });

  it("should show duplicates section when duplicates exist", () => {
    const contacts = [
      makeContact(),
      makeContact({ isDuplicate: true, firstName: "Dup", lastName: "Contact" }),
    ];
    render(<ExportPanel contacts={contacts} />);
    expect(screen.getByText("Duplicados detectados")).toBeTruthy();
  });

  it("should not show duplicates section when no duplicates", () => {
    render(<ExportPanel contacts={[makeContact()]} />);
    expect(screen.queryByText("Duplicados detectados")).toBeNull();
  });

  it("should handle empty contacts export cleanly", () => {
    render(<ExportPanel contacts={[]} />);
    fireEvent.click(screen.getByText("CSV"));
    expect(screen.getByText("CSV")).toBeTruthy();
  });
});
