import { memo } from "react";
import { Download, FileSpreadsheet, FileText, File, BarChart3, Brain, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportCSV, exportExcel, exportVCF, exportJSON, exportJSONL, exportGoogleContactsCSV, exportHubSpotCSV, exportSalesforceCSV, exportZohoCSV, exportAirtableCSV, generateHTMLReport, exportSegmentedCSV, downloadFile } from "@/lib/export-utils";
import { analytics } from "@/lib/analytics";
import type { UnifiedContact } from "@/types/contact";
import { toast } from "sonner";

interface ExportPanelProps {
  contacts: UnifiedContact[];
}

export const ExportPanel = memo(function ExportPanel({ contacts }: ExportPanelProps) {
  const clean = contacts.filter((c) => !c.isDuplicate);
  const discarded = contacts.filter((c) => c.isDuplicate);

  const handleExport = async (format: string) => {
    if (clean.length === 0) { toast.error("No hay contactos para exportar"); return; }
    const timestamp = new Date().toISOString().slice(0, 10);
    switch (format) {
      case "csv": {
        const data = exportCSV(clean);
        downloadFile(data, `contactos_${timestamp}.csv`, "text/csv;charset=utf-8");
        break;
      }
      case "excel": {
        const data = await exportExcel(clean, discarded);
        downloadFile(data, `contactos_${timestamp}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        break;
      }
      case "vcf": {
        const data = exportVCF(clean);
        downloadFile(data, `contactos_${timestamp}.vcf`, "text/vcard");
        break;
      }
      case "json": {
        const data = exportJSON(clean);
        downloadFile(data, `contactos_${timestamp}.json`, "application/json");
        break;
      }
      case "jsonl": {
        const data = exportJSONL(clean);
        downloadFile(data, `entrenamiento_${timestamp}.jsonl`, "application/jsonl");
        break;
      }
      case "report": {
        const data = generateHTMLReport(contacts);
        downloadFile(data, `informe_${timestamp}.html`, "text/html");
        break;
      }
      case "google": {
        const data = exportGoogleContactsCSV(clean);
        downloadFile(data, `google_contacts_${timestamp}.csv`, "text/csv;charset=utf-8");
        break;
      }
      case "hubspot": {
        const data = exportHubSpotCSV(clean);
        downloadFile(data, `hubspot_${timestamp}.csv`, "text/csv;charset=utf-8");
        break;
      }
      case "salesforce": {
        const data = exportSalesforceCSV(clean);
        downloadFile(data, `salesforce_${timestamp}.csv`, "text/csv;charset=utf-8");
        break;
      }
      case "zoho": {
        const data = exportZohoCSV(clean);
        downloadFile(data, `zoho_${timestamp}.csv`, "text/csv;charset=utf-8");
        break;
      }
      case "airtable": {
        const data = exportAirtableCSV(clean);
        downloadFile(data, `airtable_${timestamp}.csv`, "text/csv;charset=utf-8");
        break;
      }
    }
    const label = { csv: 'CSV', excel: 'Excel', vcf: 'VCF', json: 'JSON', jsonl: 'JSONL', report: 'HTML', google: 'Google Contacts', hubspot: 'HubSpot', salesforce: 'Salesforce', zoho: 'Zoho', airtable: 'Airtable' }[format] || format;
    analytics.exportCompleted(format, clean.length);
    toast.success(`Exportado ${clean.length} contactos en formato ${label}`);
  };

  const handleSegmentExport = (segment: "A" | "B" | "C" | "all") => {
    if (clean.length === 0) { toast.error("No hay contactos para exportar"); return; }
    const { segmentA, segmentB, segmentC, summary } = exportSegmentedCSV(contacts);
    const timestamp = new Date().toISOString().slice(0, 10);

    if (segment === "A" || segment === "all") {
      if (summary.segmentA.count > 0)
        downloadFile(segmentA, `segmento_A_${timestamp}.csv`, "text/csv;charset=utf-8-bom");
    }
    if (segment === "B" || segment === "all") {
      if (summary.segmentB.count > 0)
        downloadFile(segmentB, `segmento_B_${timestamp}.csv`, "text/csv;charset=utf-8-bom");
    }
    if (segment === "C" || segment === "all") {
      if (summary.segmentC.count > 0)
        downloadFile(segmentC, `segmento_C_${timestamp}.csv`, "text/csv;charset=utf-8-bom");
    }

    if (segment === "all") {
      toast.success(`3 archivos exportados: ${summary.segmentA.count} A · ${summary.segmentB.count} B · ${summary.segmentC.count} C`);
    } else {
      const count = segment === "A" ? summary.segmentA.count : segment === "B" ? summary.segmentB.count : summary.segmentC.count;
      toast.success(`Segmento ${segment}: ${count} contactos exportados`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Limpios" value={clean.length} icon="✓" color="text-green-600" />
        <StatCard label="Descartados" value={discarded.length} icon="✕" color="text-red-500" />
        <StatCard label="IA Limpiados" value={contacts.filter((c) => c.aiCleaned).length} icon="✨" color="text-blue-500" />
      </div>

      {/* Contact export */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="h-4 w-4" />
            Exportar contactos
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("csv")} aria-label="Exportar contactos como CSV">
            <FileText className="h-5 w-5 text-green-600" />
            <span className="text-xs font-semibold">CSV</span>
            <span className="text-[10px] text-muted-foreground">Genérico</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("excel")} aria-label="Exportar contactos como Excel">
            <FileSpreadsheet className="h-5 w-5 text-blue-500" />
            <span className="text-xs font-semibold">Excel</span>
            <span className="text-[10px] text-muted-foreground">2 hojas</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("vcf")} aria-label="Exportar contactos como VCF">
            <File className="h-5 w-5 text-primary" />
            <span className="text-xs font-semibold">VCF</span>
            <span className="text-[10px] text-muted-foreground">vCard 3.0</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("json")} aria-label="Exportar contactos como JSON">
            <FileText className="h-5 w-5 text-purple-500" />
            <span className="text-xs font-semibold">JSON</span>
            <span className="text-[10px] text-muted-foreground">Completo</span>
          </Button>
        </CardContent>
      </Card>

      {/* CRM Export */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="h-4 w-4" />
            Exportar para CRM / Plataformas
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("google")} aria-label="Exportar para Google Contacts">
            <span className="text-lg">🔵</span>
            <span className="text-xs font-semibold">Google Contacts</span>
            <span className="text-[10px] text-muted-foreground">Re-importable</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("hubspot")} aria-label="Exportar para HubSpot">
            <span className="text-lg">🟠</span>
            <span className="text-xs font-semibold">HubSpot</span>
            <span className="text-[10px] text-muted-foreground">CRM</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("salesforce")} aria-label="Exportar para Salesforce">
            <span className="text-lg">☁️</span>
            <span className="text-xs font-semibold">Salesforce</span>
            <span className="text-[10px] text-muted-foreground">CRM</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("zoho")} aria-label="Exportar para Zoho CRM">
            <span className="text-lg">🟢</span>
            <span className="text-xs font-semibold">Zoho CRM</span>
            <span className="text-[10px] text-muted-foreground">CRM</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("airtable")} aria-label="Exportar para Airtable">
            <span className="text-lg">🟡</span>
            <span className="text-xs font-semibold">Airtable</span>
            <span className="text-[10px] text-muted-foreground">Base de datos</span>
          </Button>
        </CardContent>
      </Card>

      {/* Training & Reports */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Entrenamiento e informes
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("jsonl")} aria-label="Exportar para fine-tuning IA en formato JSONL">
            <Brain className="h-5 w-5 text-orange-500" />
            <span className="text-xs font-semibold">JSONL</span>
            <span className="text-[10px] text-muted-foreground">Fine-tuning IA</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("report")} aria-label="Generar informe HTML imprimible">
            <BarChart3 className="h-5 w-5 text-teal-500" />
            <span className="text-xs font-semibold">Informe</span>
            <span className="text-[10px] text-muted-foreground">HTML imprimible</span>
          </Button>
        </CardContent>
      </Card>

      {/* Segmented Export */}
      <SegmentedExportCard contacts={contacts} onExport={handleSegmentExport} />

      {discarded.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-500">Duplicados detectados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {discarded.slice(0, 50).map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[9px] text-red-500 border-red-300">DUP</Badge>
                  <span className="truncate">{c.firstName} {c.lastName}</span>
                  <span className="truncate">{c.email || c.whatsapp}</span>
                </div>
              ))}
              {discarded.length > 50 && <p className="text-xs text-muted-foreground">...y {discarded.length - 50} más</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <p className="text-2xl mb-1">{icon}</p>
      <p className={`text-xl font-bold ${color || "text-foreground"}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function SegmentedExportCard({
  contacts,
  onExport,
}: {
  contacts: UnifiedContact[];
  onExport: (seg: "A" | "B" | "C" | "all") => void;
}) {
  const hasScores = contacts.some(c => c.relevanceScore !== undefined);
  if (!hasScores) return null;

  const { summary } = exportSegmentedCSV(contacts);
  const totalScored = summary.segmentA.count + summary.segmentB.count + summary.segmentC.count;
  const avgScore = totalScored === 0 ? 0 : Math.round(
    (summary.segmentA.count * summary.segmentA.avgScore +
     summary.segmentB.count * summary.segmentB.avgScore +
     summary.segmentC.count * summary.segmentC.avgScore) / totalScored
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Exportación segmentada
        </CardTitle>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge className="text-[10px] bg-green-100 text-green-800 border-green-300">
            A: {summary.segmentA.count} contactos (score ≥70)
          </Badge>
          <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-300">
            B: {summary.segmentB.count} contactos (40–69)
          </Badge>
          <Badge className="text-[10px] bg-gray-100 text-gray-700 border-gray-300">
            C: {summary.segmentC.count} contactos (0–39)
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            Score promedio: {avgScore}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Button
          variant="outline"
          className="h-auto py-3 flex-col gap-1 border-green-300 hover:bg-green-50"
          onClick={() => onExport("A")}
          disabled={summary.segmentA.count === 0}
          aria-label="Exportar Segmento A"
        >
          <span className="text-sm font-bold text-green-700">Segmento A</span>
          <span className="text-[10px] text-muted-foreground">Score 70-100</span>
          <span className="text-xs font-semibold text-green-600">{summary.segmentA.count} contactos</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-3 flex-col gap-1 border-yellow-300 hover:bg-yellow-50"
          onClick={() => onExport("B")}
          disabled={summary.segmentB.count === 0}
          aria-label="Exportar Segmento B"
        >
          <span className="text-sm font-bold text-yellow-700">Segmento B</span>
          <span className="text-[10px] text-muted-foreground">Score 40-69</span>
          <span className="text-xs font-semibold text-yellow-600">{summary.segmentB.count} contactos</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-3 flex-col gap-1 border-gray-300 hover:bg-gray-50"
          onClick={() => onExport("C")}
          disabled={summary.segmentC.count === 0}
          aria-label="Exportar Segmento C"
        >
          <span className="text-sm font-bold text-gray-600">Segmento C</span>
          <span className="text-[10px] text-muted-foreground">Score 0-39</span>
          <span className="text-xs font-semibold text-gray-500">{summary.segmentC.count} contactos</span>
        </Button>
        <Button
          variant="default"
          className="h-auto py-3 flex-col gap-1"
          onClick={() => onExport("all")}
          disabled={totalScored === 0}
          aria-label="Exportar los 3 segmentos"
        >
          <Download className="h-4 w-4" />
          <span className="text-xs font-semibold">Exportar los 3</span>
          <span className="text-[10px] opacity-80">3 archivos CSV</span>
        </Button>
      </CardContent>
    </Card>
  );
}
