import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Square, Loader2, Sparkles, Zap, Globe, Bot, BrainCircuit, CheckCircle2, XCircle, Clock, Wrench, Trash2, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ColumnMapper } from "./ColumnMapper";
import { autoDetectMappings } from "@/lib/column-mapper";
import { checkDuplicate } from "@/lib/dedup";
import { batchRuleClean } from "@/lib/rule-cleaner";
import { clearContacts } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import type {
  ParsedFile,
  ColumnMapping,
  ContactField,
  UnifiedContact,
  ProcessingStats,
  ProcessingLog,
} from "@/types/contact";
import { toast } from "sonner";

interface ProcessingPanelProps {
  files: ParsedFile[];
  onProcessingComplete: (contacts: UnifiedContact[]) => void;
  onResetAll?: () => void;
}

type PipelineStage = "idle" | "active" | "done" | "error";

interface PipelineState {
  mapping: PipelineStage;
  rules: PipelineStage;
  cleaning: PipelineStage;
  verifying: PipelineStage;
  correcting: PipelineStage;
  dedup: PipelineStage;
}

const INITIAL_PIPELINE: PipelineState = {
  mapping: "idle",
  rules: "idle",
  cleaning: "idle",
  verifying: "idle",
  correcting: "idle",
  dedup: "idle",
};

export function ProcessingPanel({ files, onProcessingComplete, onResetAll }: ProcessingPanelProps) {
  const [aiProvider, setAiProvider] = useState<string>("pipeline");
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [pipelineState, setPipelineState] = useState<PipelineState>(INITIAL_PIPELINE);
  const [stats, setStats] = useState<ProcessingStats>({
    totalRows: 0, processedRows: 0, uniqueContacts: 0, duplicatesFound: 0,
    aiCleanedCount: 0, rowsPerSecond: 0, startTime: 0, status: "idle",
  });
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const pauseRef = useRef(false);
  const stopRef = useRef(false);

  const allColumns = useMemo(() => [...new Set(files.flatMap((f) => f.columns))], [files]);
  const allRowsRef = useRef<Record<string, string>[]>([]);
  
  const filesKey = useMemo(() => files.map(f => f.id).join(","), [files]);
  useMemo(() => {
    allRowsRef.current = files.flatMap((f) => f.rows);
  }, [filesKey]);

  const addLog = useCallback((type: ProcessingLog["type"], message: string) => {
    setLogs((prev) => [
      { id: crypto.randomUUID(), timestamp: new Date(), type, message },
      ...prev.slice(0, 199),
    ]);
  }, []);

  useEffect(() => {
    if (files.length > 0 && mappings.length === 0) {
      const detected = autoDetectMappings(allColumns);
      setMappings(detected);
      const mapped = detected.filter((m) => m.target !== "ignore").length;
      addLog("info", `${mapped}/${allColumns.length} columnas mapeadas automaticamente`);
    }
  }, [filesKey]);

  const handleMappingChange = (index: number, target: ContactField) => {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, target } : m)));
  };

  const cleanWithAI = async (contacts: Partial<UnifiedContact>[]): Promise<Partial<UnifiedContact>[]> => {
    addLog("info", `🤖 Enviando ${contacts.length} contactos a IA para limpieza...`);
    setStats(prev => ({ ...prev, status: "cleaning" }));

    const isPipeline = aiProvider === "pipeline";
    if (isPipeline) {
      setPipelineState(prev => ({ ...prev, cleaning: "active" }));
    }

    const BATCH_SIZE = isPipeline ? 20 : 25;
    const result = [...contacts];
    let cleanedTotal = 0;

    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      if (stopRef.current) break;

      const batch = contacts.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(contacts.length / BATCH_SIZE);
      addLog("info", `🤖 Lote ${batchNum}/${totalBatches} (${batch.length} contactos)...`);

      try {
        const payload = batch.map(c => ({
          firstName: c.firstName || "",
          lastName: c.lastName || "",
          whatsapp: c.whatsapp || "",
          company: c.company || "",
          jobTitle: c.jobTitle || "",
          email: c.email || "",
        }));

        const { data, error } = await supabase.functions.invoke("clean-contacts", {
          body: { contacts: payload, provider: aiProvider },
        });

        if (error || data?.error) {
          addLog("warning", `Lote ${batchNum}: ${error?.message || data?.error}. Sin limpiar.`);
          continue;
        }

        // Show pipeline stages visually
        if (data.stages && Array.isArray(data.stages)) {
          for (const stage of data.stages) {
            addLog("info", `   ⚙️ ${stage}`);
            // Update pipeline visual based on stage content
            if (stage.includes("Limpieza")) {
              setPipelineState(prev => ({ ...prev, cleaning: stage.includes("FALLO") ? "error" : "done" }));
              if (!stage.includes("FALLO")) setPipelineState(prev => ({ ...prev, verifying: "active" }));
            }
            if (stage.includes("Verificacion")) {
              setPipelineState(prev => ({ ...prev, verifying: stage.includes("FALLO") ? "error" : "done" }));
              if (!stage.includes("FALLO")) setPipelineState(prev => ({ ...prev, correcting: "active" }));
            }
            if (stage.includes("Correccion")) {
              setPipelineState(prev => ({ ...prev, correcting: stage.includes("FALLO") ? "error" : "done" }));
            }
          }
        }

        const cleaned = data.contacts || [];
        for (let j = 0; j < batch.length && j < cleaned.length; j++) {
          result[i + j] = {
            ...result[i + j],
            firstName: cleaned[j]?.firstName || result[i + j].firstName || "",
            lastName: cleaned[j]?.lastName || result[i + j].lastName || "",
            whatsapp: cleaned[j]?.whatsapp || result[i + j].whatsapp || "",
            company: cleaned[j]?.company || result[i + j].company || "",
            jobTitle: cleaned[j]?.jobTitle || result[i + j].jobTitle || "",
            email: cleaned[j]?.email || result[i + j].email || "",
            aiCleaned: true,
          };
          cleanedTotal++;
        }

        setStats(prev => ({ ...prev, aiCleanedCount: cleanedTotal }));
      } catch (err) {
        addLog("warning", `Lote ${batchNum} error: ${err}. Sin limpiar.`);
      }

      if (i + BATCH_SIZE < contacts.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    addLog("success", `✨ IA limpio ${cleanedTotal} contactos exitosamente`);
    return result;
  };

  const startProcessing = useCallback(async () => {
    stopRef.current = false;
    pauseRef.current = false;
    const totalRows = allRowsRef.current.length;
    const startTime = Date.now();
    setPipelineState({ ...INITIAL_PIPELINE, mapping: "active" });
    setStats({ totalRows, processedRows: 0, uniqueContacts: 0, duplicatesFound: 0, aiCleanedCount: 0, rowsPerSecond: 0, startTime, status: "processing" });
    addLog("info", `Iniciando procesamiento de ${totalRows} filas...`);

    const rawContacts: Partial<UnifiedContact>[] = [];
    const activeMappings = mappings.filter((m) => m.target !== "ignore");

    // Build a lookup map: row reference → file name (avoids O(n) find per row)
    const rowSourceMap = new WeakMap<Record<string, string>, string>();
    for (const f of files) {
      for (const row of f.rows) {
        rowSourceMap.set(row, f.name);
      }
    }

    // Phase 1: Map columns — yield every 500 rows to prevent browser hang
    const CHUNK_SIZE = 500;
    for (let i = 0; i < allRowsRef.current.length; i++) {
      if (stopRef.current) { addLog("warning", "Procesamiento detenido"); break; }
      while (pauseRef.current) { await new Promise((r) => setTimeout(r, 100)); }

      const row = allRowsRef.current[i];
      const contact: Partial<UnifiedContact> = {
        id: crypto.randomUUID(),
        source: rowSourceMap.get(row) || "unknown",
        aiCleaned: false,
      };

      for (const mapping of activeMappings) {
        const rawVal = row[mapping.source];
        const val = typeof rawVal === "string" ? rawVal.trim() : String(rawVal ?? "");
        (contact as any)[mapping.target] = val;
      }

      contact.firstName = contact.firstName || "";
      contact.lastName = contact.lastName || "";
      contact.whatsapp = contact.whatsapp || "";
      contact.company = contact.company || "";
      contact.jobTitle = contact.jobTitle || "";
      contact.email = contact.email || "";

      if (!contact.firstName && !contact.lastName && !contact.email && !contact.whatsapp) continue;

      rawContacts.push(contact);

      if (i % CHUNK_SIZE === 0 || i === allRowsRef.current.length - 1) {
        const elapsed = (Date.now() - startTime) / 1000;
        setStats(prev => ({
          ...prev, processedRows: i + 1,
          rowsPerSecond: Math.round((i + 1) / elapsed),
        }));
        // Yield to main thread to prevent RESULT_CODE_HUNG
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (stopRef.current) {
      setStats(prev => ({ ...prev, status: "idle" }));
      setPipelineState(INITIAL_PIPELINE);
      return;
    }

    setPipelineState(prev => ({ ...prev, mapping: "done", rules: "active" }));

    // Phase 2: Rule-based cleaning (fast, no AI)
    addLog("info", `🔧 Limpieza por reglas de ${rawContacts.length} contactos...`);
    const { cleaned: ruleCleaned, aiIndices } = batchRuleClean(rawContacts);

    // Apply rule results
    for (let i = 0; i < rawContacts.length; i++) {
      rawContacts[i].firstName = ruleCleaned[i].firstName;
      rawContacts[i].lastName = ruleCleaned[i].lastName;
      rawContacts[i].email = ruleCleaned[i].email;
      rawContacts[i].whatsapp = ruleCleaned[i].whatsapp;
      rawContacts[i].company = ruleCleaned[i].company;
      rawContacts[i].jobTitle = ruleCleaned[i].jobTitle;
    }

    const rulesOnly = rawContacts.length - aiIndices.length;
    addLog("success", `✓ Reglas: ${rulesOnly} contactos limpios, ${aiIndices.length} necesitan IA`);
    setPipelineState(prev => ({ ...prev, rules: "done" }));

    // Phase 3: AI cleaning (only for contacts that need it)
    let cleanedContacts = rawContacts;
    if (aiIndices.length > 0) {
      const aiContacts = aiIndices.map(i => rawContacts[i]);
      addLog("info", `🤖 Enviando ${aiContacts.length}/${rawContacts.length} a IA (${Math.round(aiIndices.length/rawContacts.length*100)}%)`);
      const aiCleaned = await cleanWithAI(aiContacts);
      // Merge AI results back
      for (let j = 0; j < aiIndices.length; j++) {
        rawContacts[aiIndices[j]] = aiCleaned[j];
      }
      cleanedContacts = rawContacts;
    } else {
      addLog("info", "✓ Todos los contactos se limpiaron con reglas, IA omitida");
      setPipelineState(prev => ({ ...prev, cleaning: "done", verifying: "done", correcting: "done" }));
    }

    // Phase 3: Dedup
    setPipelineState(prev => ({ ...prev, dedup: "active" }));
    addLog("info", "Detectando duplicados...");
    const contacts: UnifiedContact[] = [];
    for (let i = 0; i < cleanedContacts.length; i++) {
      const contact = cleanedContacts[i] as UnifiedContact;
      const dedupResult = checkDuplicate(
        { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, whatsapp: contact.whatsapp },
        contacts
      );
      contact.isDuplicate = dedupResult.isDuplicate;
      contact.duplicateOf = dedupResult.duplicateOf;
      contact.confidence = dedupResult.confidence;
      contacts.push(contact);
      // Yield every 1000 rows to keep browser responsive
      if (i % 1000 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    setPipelineState(prev => ({ ...prev, dedup: "done" }));

    const unique = contacts.filter((c) => !c.isDuplicate);
    const dupes = contacts.filter((c) => c.isDuplicate);
    const aiCount = contacts.filter((c) => c.aiCleaned).length;

    setStats({
      totalRows, processedRows: totalRows,
      uniqueContacts: unique.length, duplicatesFound: dupes.length,
      aiCleanedCount: aiCount,
      rowsPerSecond: Math.round(totalRows / ((Date.now() - startTime) / 1000)),
      startTime, status: "done",
    });
    addLog("success", `✓ Completado: ${unique.length} unicos, ${dupes.length} duplicados, ${aiCount} limpiados por IA`);
    toast.success(`Procesamiento completado: ${unique.length} contactos unicos`);
    onProcessingComplete(contacts);
  }, [files, mappings, addLog, onProcessingComplete, aiProvider]);

  const progress = stats.totalRows > 0 ? (stats.processedRows / stats.totalRows) * 100 : 0;
  const statusLabel = {
    idle: "Iniciar", processing: "Procesando...", cleaning: "🤖 IA limpiando...",
    paused: "Pausado", done: "Reprocesar", error: "Error",
  };

  const isActive = stats.status === "processing" || stats.status === "cleaning";
  const isPipeline = aiProvider === "pipeline";

  return (
    <div className="space-y-4">
      <ColumnMapper mappings={mappings} sampleData={allRowsRef.current.slice(0, 3)} onMappingChange={handleMappingChange} />

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
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Motor IA:</span>
              <Select value={aiProvider} onValueChange={setAiProvider}>
                <SelectTrigger className="h-8 text-xs w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pipeline">
                    <span className="flex items-center gap-1.5"><BrainCircuit className="h-3 w-3 text-orange-500" /> Pipeline 3 IAs — Mejor calidad</span>
                  </SelectItem>
                  <SelectItem value="groq">
                    <span className="flex items-center gap-1.5"><Zap className="h-3 w-3 text-yellow-500" /> Groq (Llama 3.3) — Rapido</span>
                  </SelectItem>
                  <SelectItem value="openrouter">
                    <span className="flex items-center gap-1.5"><Globe className="h-3 w-3 text-purple-500" /> OpenRouter (Mistral) — Free</span>
                  </SelectItem>
                  <SelectItem value="lovable">
                    <span className="flex items-center gap-1.5"><Bot className="h-3 w-3 text-blue-500" /> Lovable AI (Gemini Flash)</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Pipeline visual tracker */}
          {isPipeline && (isActive || stats.status === "done") && (
            <div className="rounded-lg border bg-card/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-3">Pipeline de procesamiento</p>
              <div className="flex items-center gap-1 flex-wrap">
                <PipelineStep icon={<Play className="h-3 w-3" />} label="Mapeo" state={pipelineState.mapping} />
                <PipelineConnector active={pipelineState.mapping === "done"} />
                <PipelineStep icon={<Wrench className="h-3 w-3" />} label="Reglas" sublabel="Limpieza rapida" state={pipelineState.rules} />
                <PipelineConnector active={pipelineState.rules === "done"} />
                <PipelineStep icon={<Zap className="h-3 w-3" />} label="Groq" sublabel="IA Limpieza" state={pipelineState.cleaning} />
                <PipelineConnector active={pipelineState.cleaning === "done"} />
                <PipelineStep icon={<Globe className="h-3 w-3" />} label="OpenRouter" sublabel="Verificacion" state={pipelineState.verifying} />
                <PipelineConnector active={pipelineState.verifying === "done"} />
                <PipelineStep icon={<Bot className="h-3 w-3" />} label="Lovable" sublabel="Correccion" state={pipelineState.correcting} />
                <PipelineConnector active={pipelineState.correcting === "done"} />
                <PipelineStep icon={<CheckCircle2 className="h-3 w-3" />} label="Dedup" state={pipelineState.dedup} />
              </div>
            </div>
          )}

          {/* Single provider visual */}
          {!isPipeline && isActive && (
            <div className="rounded-lg border bg-card/50 p-3">
              <div className="flex items-center gap-2 text-xs">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-muted-foreground">
                  {stats.status === "cleaning" ? "IA procesando contactos..." : "Mapeando columnas..."}
                </span>
                {stats.aiCleanedCount > 0 && (
                  <Badge variant="outline" className="text-[10px]">{stats.aiCleanedCount} limpiados</Badge>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-between">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={async () => {
                await clearContacts();
                setLogs([]);
                setStats({ totalRows: 0, processedRows: 0, uniqueContacts: 0, duplicatesFound: 0, aiCleanedCount: 0, rowsPerSecond: 0, startTime: 0, status: "idle" });
                setPipelineState(INITIAL_PIPELINE);
                addLog("info", "🧹 Limpieza completada — logs y estado reiniciados");
                toast.success("Estado limpiado");
              }}>
                <Trash2 className="h-4 w-4" />
                Clean Up
              </Button>
              {onResetAll && (
                <Button size="sm" variant="destructive" onClick={() => {
                  stopRef.current = true;
                  onResetAll();
                  setLogs([]);
                  setStats({ totalRows: 0, processedRows: 0, uniqueContacts: 0, duplicatesFound: 0, aiCleanedCount: 0, rowsPerSecond: 0, startTime: 0, status: "idle" });
                  setPipelineState(INITIAL_PIPELINE);
                  toast.success("Todo reiniciado");
                }}>
                  <RotateCcw className="h-4 w-4" />
                  Reset All
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={startProcessing} disabled={isActive || files.length === 0}>
                {isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {statusLabel[stats.status]}
              </Button>
              {stats.status === "processing" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => { pauseRef.current = !pauseRef.current; setStats((p) => ({ ...p, status: pauseRef.current ? "paused" : "processing" })); }}>
                    <Pause className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => { stopRef.current = true; }}>
                    <Square className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Procesadas" value={stats.processedRows} total={stats.totalRows} />
            <StatCard label="Unicos" value={stats.uniqueContacts} color="text-green-600" />
            <StatCard label="Duplicados" value={stats.duplicatesFound} color="text-red-500" />
            <StatCard label="IA Limpiados" value={stats.aiCleanedCount} color="text-blue-500" />
          </div>
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Log</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[150px]">
              <div className="space-y-1 text-xs font-mono">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">{log.timestamp.toLocaleTimeString()}</span>
                    <Badge variant={log.type === "error" ? "destructive" : "outline"} className="text-[10px] h-4 shrink-0">
                      {log.type}
                    </Badge>
                    <span className={
                      log.type === "error" ? "text-destructive" :
                      log.type === "success" ? "text-green-600" :
                      log.type === "warning" ? "text-yellow-600" : ""
                    }>
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

function PipelineStep({ icon, label, sublabel, state }: { icon: React.ReactNode; label: string; sublabel?: string; state: PipelineStage }) {
  const stateStyles: Record<PipelineStage, string> = {
    idle: "border-muted bg-muted/30 text-muted-foreground",
    active: "border-primary bg-primary/10 text-primary ring-2 ring-primary/30 animate-pulse",
    done: "border-green-500 bg-green-500/10 text-green-500",
    error: "border-red-500 bg-red-500/10 text-red-500",
  };

  const stateIcon = state === "done" ? <CheckCircle2 className="h-3 w-3" /> :
                    state === "error" ? <XCircle className="h-3 w-3" /> :
                    state === "active" ? <Loader2 className="h-3 w-3 animate-spin" /> :
                    <Clock className="h-3 w-3" />;

  return (
    <div className={`flex flex-col items-center gap-1 px-1.5 py-1.5 rounded-lg border transition-all duration-300 min-w-[52px] ${stateStyles[state]}`}>
      <div className="flex items-center gap-1">
        {stateIcon}
      </div>
      <span className="text-[9px] font-medium leading-none">{label}</span>
      {sublabel && <span className="text-[8px] opacity-70 leading-none">{sublabel}</span>}
    </div>
  );
}

function PipelineConnector({ active }: { active: boolean }) {
  return (
    <div className={`h-0.5 w-3 shrink-0 rounded-full transition-colors duration-500 ${active ? "bg-green-500" : "bg-muted"}`} />
  );
}

function StatCard({ label, value, total, color }: { label: string; value: number | string; total?: number; color?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <p className={`text-lg font-bold ${color || "text-foreground"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-muted-foreground">
        {label}{total != null && ` / ${total.toLocaleString()}`}
      </p>
    </div>
  );
}
