import { memo } from "react";
import { Download, FileSpreadsheet, FileText, File, BarChart3, Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportCSV, exportExcel, exportVCF, exportJSON, exportJSONL, generateHTMLReport, downloadFile } from "@/lib/export-utils";
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
    }
    const label = { csv: 'CSV', excel: 'Excel', vcf: 'VCF', json: 'JSON', jsonl: 'JSONL', report: 'HTML' }[format] || format;
    analytics.exportCompleted(format, clean.length);
    toast.success(`Exportado ${clean.length} contactos en formato ${label}`);
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
            <span className="text-[10px] text-muted-foreground">Google Contacts</span>
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
