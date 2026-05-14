import { Play, Pause, Square, Loader2, Sparkles, Zap, Globe, Bot, BrainCircuit, Trash2, RotateCcw, Shield, Shuffle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ColumnMapper } from "./ColumnMapper";
import { PipelineVisualizer } from "./PipelineVisualizer";
import { useContactProcessing, suggestOptimalConfig } from "@/hooks/useContactProcessing";
import { PROVIDERS } from "@/lib/providers";
import { canProcess } from "@/lib/usage-limits";
import type { ParsedFile, UnifiedContact } from "@/types/contact";
import { toast } from "sonner";

interface ProcessingPanelProps {
  files: ParsedFile[];
  onProcessingComplete: (contacts: UnifiedContact[]) => void;
  onResetAll?: () => void;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  groq: <Zap className="h-3 w-3 text-yellow-500" />,
  openrouter: <Globe className="h-3 w-3 text-purple-500" />,
  together: <Zap className="h-3 w-3 text-emerald-500" />,
  cerebras: <Zap className="h-3 w-3 text-cyan-500" />,
  deepinfra: <Zap className="h-3 w-3 text-red-500" />,
  sambanova: <Zap className="h-3 w-3 text-green-500" />,
  mistral: <Zap className="h-3 w-3 text-indigo-500" />,
  deepseek: <Zap className="h-3 w-3 text-teal-500" />,
  gemini: <Sparkles className="h-3 w-3 text-blue-400" />,
  cloudflare: <Globe className="h-3 w-3 text-orange-400" />,
  huggingface: <Bot className="h-3 w-3 text-yellow-600" />,
  nebius: <Zap className="h-3 w-3 text-violet-500" />,
};

function getProviderName(id: string): string {
  const p = PROVIDERS.find(p => p.id === id);
  return p ? p.name.split(" (")[0] : id;
}

const STAGE_INFO = {
  clean:    { label: "Limpieza",   desc: "Normaliza nombres, teléfonos, emails", icon: <Zap className="h-3 w-3" /> },
  verify:   { label: "Verificación", desc: "Revisa errores de la primera IA",    icon: <Globe className="h-3 w-3" /> },
  correct:  { label: "Corrección",  desc: "Resuelve los issues detectados",      icon: <Bot className="h-3 w-3" /> },
};

const COUNTRIES = [
  { value: "AR", label: "🇦🇷 Argentina (+54)" },
  { value: "MX", label: "🇲🇽 México (+52)" },
  { value: "ES", label: "🇪🇸 España (+34)" },
  { value: "CO", label: "🇨🇴 Colombia (+57)" },
  { value: "CL", label: "🇨🇱 Chile (+56)" },
  { value: "PE", label: "🇵🇪 Perú (+51)" },
  { value: "VE", label: "🇻🇪 Venezuela (+58)" },
  { value: "UY", label: "🇺🇾 Uruguay (+598)" },
  { value: "PY", label: "🇵🇾 Paraguay (+595)" },
  { value: "EC", label: "🇪🇨 Ecuador (+593)" },
  { value: "BO", label: "🇧🇴 Bolivia (+591)" },
  { value: "CR", label: "🇨🇷 Costa Rica (+506)" },
  { value: "DO", label: "🇩🇴 Rep. Dominicana (+1)" },
  { value: "GT", label: "🇬🇹 Guatemala (+502)" },
  { value: "US", label: "🇺🇸 Estados Unidos (+1)" },
  { value: "BR", label: "🇧🇷 Brasil (+55)" },
  { value: "GB", label: "🇬🇧 Reino Unido (+44)" },
  { value: "DE", label: "🇩🇪 Alemania (+49)" },
  { value: "FR", label: "🇫🇷 Francia (+33)" },
  { value: "IT", label: "🇮🇹 Italia (+39)" },
  { value: "PT", label: "🇵🇹 Portugal (+351)" },
];

export function ProcessingPanel({ files, onProcessingComplete, onResetAll }: ProcessingPanelProps) {
  const p = useContactProcessing(files);
  const totalRows = p.allRowsRef.current.length;

  const handleStart = () => {
    const check = canProcess(totalRows);
    if (!check.allowed) {
      toast.error(check.reason, { description: check.suggestion, duration: 6000 });
      return;
    }
    p.startProcessing((contacts) => {
      onProcessingComplete(contacts);
    });
  };

  return (
    <div className="space-y-4">
      <ColumnMapper mappings={p.mappings} sampleData={p.allRowsRef.current} onMappingChange={p.handleMappingChange} />

      {/* Free tier limit warning */}
      {(() => {
        const check = canProcess(totalRows);
        if (!check.allowed) {
          return (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">{check.reason}</p>
                <p className="text-xs text-muted-foreground mt-1">{check.suggestion}</p>
              </div>
            </div>
          );
        }
        return null;
      })()}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                Procesamiento
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Sparkles className="h-3 w-3" /> IA integrada
                </Badge>
              </span>
              {p.activeProviders.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {p.activeProviders.length} proveedores activos
                </Badge>
              )}
            </div>

            {/* Mode + Country row */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={p.mode === "pipeline" ? "default" : "outline"} className="h-8 text-xs gap-1.5" onClick={() => p.setMode("pipeline")}>
                <BrainCircuit className="h-3 w-3" /> Pipeline 3 IAs
              </Button>
              <Button size="sm" variant={p.mode === "single" ? "default" : "outline"} className="h-8 text-xs gap-1.5" onClick={() => p.setMode("single")}>
                <Zap className="h-3 w-3" /> Proveedor único
              </Button>
              <Select value={p.defaultCountry} onValueChange={p.setDefaultCountry}>
                <SelectTrigger className="h-8 text-xs w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map(c => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Pipeline config */}
            {p.mode === "pipeline" && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Configuración del pipeline</p>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1"
                    onClick={() => { p.setStageConfig(suggestOptimalConfig(p.activeProviders)); }}>
                    <Shuffle className="h-3 w-3" /> Sugerir óptimo
                  </Button>
                </div>
                {(["clean", "verify", "correct"] as const).map((stage) => (
                  <div key={stage} className="flex items-center gap-2">
                    <div className="w-[110px] shrink-0">
                      <p className="text-[11px] font-medium flex items-center gap-1">{STAGE_INFO[stage].icon} {STAGE_INFO[stage].label}</p>
                      <p className="text-[9px] text-muted-foreground">{STAGE_INFO[stage].desc}</p>
                    </div>
                    <Select value={p.stageConfig[stage]} onValueChange={(v) => p.setStageConfig(prev => ({ ...prev, [stage]: v }))}>
                      <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {p.activeProviders.length > 0 ? p.activeProviders.map(id => (
                          <SelectItem key={id} value={id} className="text-xs">
                            <span className="flex items-center gap-1.5">{PROVIDER_ICONS[id] || <Zap className="h-3 w-3" />} {getProviderName(id)}</span>
                          </SelectItem>
                        )) : <SelectItem value="groq" className="text-xs text-muted-foreground" disabled>Sin keys configuradas</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                {p.activeProviders.length === 0 && <p className="text-[10px] text-yellow-600 mt-1">⚠️ Configurá al menos 1 API key en la pestaña Config.</p>}
              </div>
            )}

            {/* Single provider selector */}
            {p.mode === "single" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Proveedor:</span>
                <Select value={p.singleProvider} onValueChange={p.setSingleProvider}>
                  <SelectTrigger className="h-8 text-xs w-[280px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map(pr => (
                      <SelectItem key={pr.id} value={pr.id} className="text-xs">
                        <span className="flex items-center gap-1.5">{PROVIDER_ICONS[pr.id] || <Zap className="h-3 w-3" />} {pr.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Pipeline visual */}
          {p.mode === "pipeline" && (p.isActive || p.stats.status === "done") && (
            <PipelineVisualizer pipelineState={p.pipelineState} stageConfig={p.stageConfig} mode={p.mode} singleProvider={p.singleProvider} />
          )}

          {/* Single provider visual */}
          {p.mode === "single" && p.isActive && (
            <div className="rounded-lg border bg-card/50 p-3">
              <div className="flex items-center gap-2 text-xs">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-muted-foreground">
                  {p.stats.status === "cleaning" ? `${getProviderName(p.singleProvider)} procesando...` : "Mapeando columnas..."}
                </span>
                {p.stats.aiCleanedCount > 0 && <Badge variant="outline" className="text-[10px]">{p.stats.aiCleanedCount} limpiados</Badge>}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-2 justify-between">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={p.cleanUp}><Trash2 className="h-4 w-4" /> Clean Up</Button>
              {onResetAll && (
                <Button size="sm" variant="destructive" onClick={() => { p.resetState(); onResetAll(); }}>
                  <RotateCcw className="h-4 w-4" /> Reset All
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleStart} disabled={p.isActive || files.length === 0}>
                {p.isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {p.isActive ? "Procesando..." : p.stats.status === "done" ? "Reprocesar" : "Iniciar"}
              </Button>
              {p.stats.status === "processing" && (
                <>
                  <Button size="sm" variant="outline" onClick={p.pause}><Pause className="h-4 w-4" /></Button>
                  <Button size="sm" variant="destructive" onClick={p.stop}><Square className="h-4 w-4" /></Button>
                </>
              )}
            </div>
          </div>

          <Progress value={p.progress} className="h-2" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Procesadas" value={p.stats.processedRows} total={p.stats.totalRows} />
            <StatCard label="Únicos" value={p.stats.uniqueContacts} color="text-green-600" />
            <StatCard label="Duplicados" value={p.stats.duplicatesFound} color="text-red-500" />
            <StatCard label="IA Limpiados" value={p.stats.aiCleanedCount} color="text-blue-500" />
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      {p.logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Log</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-[150px]">
              <div className="space-y-1 text-xs font-mono">
                {p.logs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">{log.timestamp.toLocaleTimeString()}</span>
                    <Badge variant={log.type === "error" ? "destructive" : "outline"} className="text-[10px] h-4 shrink-0">{log.type}</Badge>
                    <span className={log.type === "error" ? "text-destructive" : log.type === "success" ? "text-green-600" : log.type === "warning" ? "text-yellow-600" : ""}>{log.message}</span>
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
      <p className={`text-lg font-bold ${color || "text-foreground"}`}>{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-xs text-muted-foreground">{label}{total != null && ` / ${total.toLocaleString()}`}</p>
    </div>
  );
}
