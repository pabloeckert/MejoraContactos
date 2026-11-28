import { Play, Pause, Square, Loader2, Trash2, RotateCcw, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ColumnMapper } from "./ColumnMapper";
import { PipelineVisualizer } from "./PipelineVisualizer";
import { useContactProcessing } from "@/hooks/useContactProcessing";
import type { ParsedFile, UnifiedContact } from "@/types/contact";

interface ProcessingPanelProps {
  files: ParsedFile[];
  onProcessingComplete: (contacts: UnifiedContact[]) => void;
  onResetAll?: () => void;
}

const COUNTRIES = [
  { value: "AR", label: "🇦🇷 Argentina (+54)" },
  { value: "MX", label: "🇲🇽 México (+52)" },
  { value: "ES", label: "🇪🇸 España (+34)" },
  { value: "CO", label: "🇨🇴 Colombia (+57)" },
  { value: "CL", label: "🇨🇱 Chile (+56)" },
  { value: "PE", label: "🇵🇪 Perú (+51)" },
  { value: "UY", label: "🇺🇾 Uruguay (+598)" },
  { value: "PY", label: "🇵🇾 Paraguay (+595)" },
  { value: "EC", label: "🇪🇨 Ecuador (+593)" },
  { value: "BO", label: "🇧🇴 Bolivia (+591)" },
  { value: "US", label: "🇺🇸 Estados Unidos (+1)" },
  { value: "BR", label: "🇧🇷 Brasil (+55)" },
];

export function ProcessingPanel({ files, onProcessingComplete, onResetAll }: ProcessingPanelProps) {
  const p = useContactProcessing(files);

  const handleStart = () => {
    p.startProcessing((contacts) => {
      onProcessingComplete(contacts);
    });
  };

  return (
    <div className="space-y-4">
      <ColumnMapper mappings={p.mappings} sampleData={p.allRowsRef.current} onMappingChange={p.handleMappingChange} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-2">
                Procesamiento Local
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Shield className="h-3 w-3" /> 100% Offline
                </Badge>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-normal text-muted-foreground">País por defecto:</span>
                <Select value={p.defaultCountry} onValueChange={p.setDefaultCountry}>
                  <SelectTrigger className="h-8 text-xs w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.value} value={c.value} className="text-xs">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {(p.isActive || p.stats.status === "done") && <PipelineVisualizer pipelineState={p.pipelineState} />}

          <div className="flex gap-2 justify-between flex-wrap">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={p.cleanUp}>
                <Trash2 className="h-4 w-4 mr-1" /> Limpiar
              </Button>
              {onResetAll && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    p.resetState();
                    onResetAll();
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-1" /> Reiniciar
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleStart} disabled={p.isActive || files.length === 0}>
                {p.isActive ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                {p.isActive ? "Procesando..." : p.stats.status === "done" ? "Reprocesar" : "Iniciar"}
              </Button>
              {p.stats.status === "processing" && (
                <>
                  <Button size="sm" variant="outline" onClick={p.pause}>
                    <Pause className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={p.stop}>
                    <Square className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <Progress value={p.progress} className="h-2" />

          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Procesadas" value={p.stats.processedRows} total={p.stats.totalRows} />
            <StatCard label="Únicos" value={p.stats.uniqueContacts} color="text-green-600" />
            <StatCard label="Duplicados" value={p.stats.duplicatesFound} color="text-red-500" />
          </div>
        </CardContent>
      </Card>

      {p.logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Registro de ejecución</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[150px]">
              <div className="space-y-1 text-xs font-mono">
                {p.logs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">{log.timestamp.toLocaleTimeString()}</span>
                    <Badge variant={log.type === "error" ? "destructive" : "outline"} className="text-[10px] h-4 shrink-0">
                      {log.type}
                    </Badge>
                    <span
                      className={
                        log.type === "error"
                          ? "text-destructive"
                          : log.type === "success"
                            ? "text-green-600"
                            : log.type === "warning"
                              ? "text-yellow-600"
                              : ""
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, total, color }: { label: string; value: number | string; total?: number; color?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <p className={`text-lg font-bold ${color || "text-foreground"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-muted-foreground">
        {label}
        {total != null && ` / ${total.toLocaleString()}`}
      </p>
    </div>
  );
}
