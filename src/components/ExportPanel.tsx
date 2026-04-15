import { Download, FileSpreadsheet, FileText, File } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportCSV, exportExcel, exportVCF, exportJSON, downloadFile } from "@/lib/export-utils";
import type { UnifiedContact } from "@/types/contact";
import { toast } from "sonner";

interface ExportPanelProps {
  contacts: UnifiedContact[];
}

export function ExportPanel({ contacts }: ExportPanelProps) {
  const clean = contacts.filter((c) => !c.isDuplicate);
  const discarded = contacts.filter((c) => c.isDuplicate);

  const handleExport = (format: string) => {
    if (clean.length === 0) {
      toast.error("No hay contactos para exportar");
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 10);

    switch (format) {
      case "csv": {
        const data = exportCSV(clean);
        downloadFile(data, `contactos_${timestamp}.csv`, "text/csv;charset=utf-8");
        break;
      }
      case "excel": {
        const data = exportExcel(clean, discarded);
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
    }

    toast.success(`Exportado ${clean.length} contactos en formato ${format.toUpperCase()}`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Contactos limpios" value={clean.length} icon="✓" color="text-green-400" />
        <StatCard label="Descartados" value={discarded.length} icon="✕" color="text-yellow-400" />
        <StatCard label="Con teléfono" value={clean.filter((c) => c.phoneValid).length} icon="📱" />
        <StatCard label="Con email" value={clean.filter((c) => c.email).length} icon="📧" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="h-4 w-4" />
            Exportar contactos
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("csv")}>
            <FileText className="h-5 w-5 text-green-400" />
            <span className="text-xs">CSV</span>
            <span className="text-[10px] text-muted-foreground">Google Contacts</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("excel")}>
            <FileSpreadsheet className="h-5 w-5 text-blue-400" />
            <span className="text-xs">Excel</span>
            <span className="text-[10px] text-muted-foreground">2 hojas</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("vcf")}>
            <File className="h-5 w-5 text-purple-400" />
            <span className="text-xs">VCF</span>
            <span className="text-[10px] text-muted-foreground">vCard 3.0</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => handleExport("json")}>
            <FileText className="h-5 w-5 text-primary" />
            <span className="text-xs">JSON</span>
            <span className="text-[10px] text-muted-foreground">Completo</span>
          </Button>
        </CardContent>
      </Card>

      {discarded.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-yellow-400">Duplicados detectados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {discarded.slice(0, 50).map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[9px]">DUP</Badge>
                  <span className="truncate">{c.firstName} {c.lastName}</span>
                  <span className="truncate">{c.email || c.phone}</span>
                </div>
              ))}
              {discarded.length > 50 && (
                <p className="text-xs text-muted-foreground">...y {discarded.length - 50} más</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color?: string }) {
  return (
    <div className="rounded-md bg-secondary/50 p-4 text-center">
      <p className="text-2xl mb-1">{icon}</p>
      <p className={`text-xl font-bold ${color || ""}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
