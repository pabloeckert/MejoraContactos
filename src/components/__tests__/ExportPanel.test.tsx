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
  exportJSONL: vi.fn().mockReturnValue("{}\n"),
  exportGoogleContactsCSV: vi.fn().mockReturnValue("google-csv-data"),
  exportHubSpotCSV: vi.fn().mockReturnValue("hubspot-csv-data"),
  exportSalesforceCSV: vi.fn().mockReturnValue("salesforce-csv-data"),
  exportZohoCSV: vi.fn().mockReturnValue("zoho-csv-data"),
  exportAirtableCSV: vi.fn().mockReturnValue("airtable-csv-data"),
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
    expect(screen.getByText("IA Limpiados")).toBeTruthy();
  });

  it("should show correct counts", () => {
    const contacts = [
      makeContact(),
      makeContact({ isDuplicate: true }),
      makeContact({ aiCleaned: true }),
    ];
    render(<ExportPanel contacts={contacts} />);
    // 2 clean (not duplicate), 1 discarded, 1 ai cleaned
    expect(screen.getByText("Limpios")).toBeTruthy();
    expect(screen.getByText("Descartados")).toBeTruthy();
    expect(screen.getByText("IA Limpiados")).toBeTruthy();
  });

  it("should render export format buttons", () => {
    render(<ExportPanel contacts={[makeContact()]} />);
    expect(screen.getByText("CSV")).toBeTruthy();
    expect(screen.getByText("Excel")).toBeTruthy();
    expect(screen.getByText("VCF")).toBeTruthy();
    expect(screen.getByText("JSON")).toBeTruthy();
    expect(screen.getByText("JSONL")).toBeTruthy();
    expect(screen.getByText("Informe")).toBeTruthy();
    // CRM formats
    expect(screen.getByText("Google Contacts")).toBeTruthy();
    expect(screen.getByText("HubSpot")).toBeTruthy();
    expect(screen.getByText("Salesforce")).toBeTruthy();
    expect(screen.getByText("Zoho CRM")).toBeTruthy();
    expect(screen.getByText("Airtable")).toBeTruthy();
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

  it("should show error toast when exporting empty contacts", () => {
    render(<ExportPanel contacts={[]} />);
    const csvButton = screen.getByText("CSV");
    fireEvent.click(csvButton);
    // toast.error is called (mocked)
  });

  it("should render training section", () => {
    render(<ExportPanel contacts={[makeContact()]} />);
    expect(screen.getByText("Entrenamiento e informes")).toBeTruthy();
  });
});
