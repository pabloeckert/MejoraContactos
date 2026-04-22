import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Square, Loader2, Sparkles, Zap, Globe, Bot, BrainCircuit, CheckCircle2, XCircle, Clock, Wrench, Trash2, RotateCcw, FlameKindling, Cpu, Server, Wind, Search, Shuffle, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ColumnMapper } from "./ColumnMapper";
import { autoDetectMappings } from "@/lib/column-mapper";
import { DedupIndex } from "@/lib/dedup";
import { batchRuleClean } from "@/lib/rule-cleaner";
import { validateBatchWithAI, clearValidationCache } from "@/lib/ai-validator";
import { validateContactFields } from "@/lib/field-validator";
import { clearContacts } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { getActiveKeysMulti, PROVIDERS } from "./ApiKeysPanel";
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
  validation: PipelineStage;
  dedup: PipelineStage;
}

interface StageConfig {
  clean: string;
  verify: string;
  correct: string;
}

const INITIAL_PIPELINE: PipelineState = {
  mapping: "idle", rules: "idle", cleaning: "idle",
  verifying: "idle", correcting: "idle", validation: "idle", dedup: "idle",
};

const STAGE_INFO = {
  clean:    { label: "Limpieza",   desc: "Normaliza nombres, teléfonos, emails",           icon: <Zap className="h-3 w-3" /> },
  verify:   { label: "Verificación", desc: "Revisa errores de la primera IA",              icon: <Globe className="h-3 w-3" /> },
  correct:  { label: "Corrección",  desc: "Resuelve los issues detectados",                icon: <Bot className="h-3 w-3" /> },
};

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  groq: <Zap className="h-3 w-3 text-yellow-500" />,
  openrouter: <Globe className="h-3 w-3 text-purple-500" />,
  lovable: <Bot className="h-3 w-3 text-blue-500" />,
  together: <Server className="h-3 w-3 text-emerald-500" />,
  cerebras: <Cpu className="h-3 w-3 text-cyan-500" />,
  deepinfra: <FlameKindling className="h-3 w-3 text-red-500" />,
  sambanova: <Zap className="h-3 w-3 text-green-500" />,
  mistral: <Wind className="h-3 w-3 text-indigo-500" />,
  deepseek: <Search className="h-3 w-3 text-teal-500" />,
  gemini: <Sparkles className="h-3 w-3 text-blue-400" />,
  cloudflare: <Globe className="h-3 w-3 text-orange-400" />,
  huggingface: <Bot className="h-3 w-3 text-yellow-600" />,
  nebius: <Server className="h-3 w-3 text-violet-500" />,
};

function getProviderName(id: string): string {
  const p = PROVIDERS.find(p => p.id === id);
  return p ? p.name.split(" (")[0] : id;
}

function suggestOptimalConfig(activeProviders: string[]): StageConfig {
  // Priority lists for each stage
  const cleanPriority = ["groq", "cerebras", "sambanova", "deepinfra", "together", "mistral", "openrouter", "deepseek", "gemini", "cloudflare", "huggingface", "nebius", "lovable"];
  const verifyPriority = ["openrouter", "mistral", "deepseek", "gemini", "together", "groq", "cerebras", "deepinfra", "sambanova", "cloudflare", "huggingface", "nebius", "lovable"];
  const correctPriority = ["lovable", "gemini", "openrouter", "deepseek", "groq", "mistral", "together", "cerebras", "deepinfra", "sambanova", "cloudflare", "huggingface", "nebius"];

  const pick = (priority: string[], used: Set<string>): string => {
    for (const p of priority) {
      if (activeProviders.includes(p) && !used.has(p)) return p;
    }
    // Fallback: reuse any active provider
    for (const p of priority) {
      if (activeProviders.includes(p)) return p;
    }
    return activeProviders[0] || "groq";
  };

  const used = new Set<string>();
  const clean = pick(cleanPriority, used);
  used.add(clean);
  const verify = pick(verifyPriority, used);
  used.add(verify);
  const correct = pick(correctPriority, used);

  return { clean, verify, correct };
}

export function ProcessingPanel({ files, onProcessingComplete, onResetAll }: ProcessingPanelProps) {
  const [mode, setMode] = useState<"single" | "pipeline">("pipeline");
  const [singleProvider, setSingleProvider] = useState<string>("groq");
  const [stageConfig, setStageConfig] = useState<StageConfig>({ clean: "groq", verify: "openrouter", correct: "lovable" });
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
  useMemo(() => { allRowsRef.current = files.flatMap((f) => f.rows); }, [filesKey]);

  // Detect active providers and suggest optimal config
  const activeKeys = useMemo(() => getActiveKeysMulti(), []);
  const activeProviders = useMemo(() => Object.keys(activeKeys).filter(k => activeKeys[k].length > 0), [activeKeys]);

  // Auto-suggest on first load or when providers change
  useEffect(() => {
    if (activeProviders.length > 0) {
      const suggested = suggestOptimalConfig(activeProviders);
      setStageConfig(suggested);
    }
  }, [activeProviders.join(",")]);

  const addLog = useCallback((type: ProcessingLog["type"], message: string) => {
    setLogs((prev) => [{ id: crypto.randomUUID(), timestamp: new Date(), type, message }, ...prev.slice(0, 199)]);
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
    addLog("info", `🤖 Enviando ${contacts.length} contactos a IA...`);
    setStats(prev => ({ ...prev, status: "cleaning" }));

    const isPipeline = mode === "pipeline";
    if (isPipeline) setPipelineState(prev => ({ ...prev, cleaning: "active" }));

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
          firstName: c.firstName || "", lastName: c.lastName || "",
          whatsapp: c.whatsapp || "", company: c.company || "",
          jobTitle: c.jobTitle || "", email: c.email || "",
        }));

        const body: Record<string, any> = {
          contacts: payload,
          provider: isPipeline ? "pipeline" : singleProvider,
          customKeys: getActiveKeysMulti(),
        };

        if (isPipeline) {
          body.pipelineStages = stageConfig;
        }

        const { data, error } = await supabase.functions.invoke("clean-contacts", { body });

        if (error || data?.error) {
          const errMsg = error?.message || data?.error;
          if (data?.exhausted) {
            toast.error("🔴 Todas las API keys agotadas. Agregá más keys en la pestaña Config.", { duration: 10000 });
          } else {
            toast.warning(`⚠️ Lote ${batchNum}: ${errMsg}`);
          }
          addLog("warning", `Lote ${batchNum}: ${errMsg}. Sin limpiar.`);
          continue;
        }

        if (data.stages && Array.isArray(data.stages)) {
          for (const stage of data.stages) {
            addLog("info", `   ⚙️ ${stage}`);
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
      if (i + BATCH_SIZE < contacts.length) await new Promise(r => setTimeout(r, 300));
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
    const rowSourceMap = new WeakMap<Record<string, string>, string>();
    for (const f of files) for (const row of f.rows) rowSourceMap.set(row, f.name);

    const CHUNK_SIZE = 500;
    for (let i = 0; i < allRowsRef.current.length; i++) {
      if (stopRef.current) { addLog("warning", "Procesamiento detenido"); break; }
      while (pauseRef.current) await new Promise((r) => setTimeout(r, 100));

      const row = allRowsRef.current[i];
      const contact: Partial<UnifiedContact> = { id: crypto.randomUUID(), source: rowSourceMap.get(row) || "unknown", aiCleaned: false };
      for (const mapping of activeMappings) {
        const rawVal = row[mapping.source];
        (contact as any)[mapping.target] = typeof rawVal === "string" ? rawVal.trim() : String(rawVal ?? "");
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
        setStats(prev => ({ ...prev, processedRows: i + 1, rowsPerSecond: Math.round((i + 1) / elapsed) }));
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (stopRef.current) { setStats(prev => ({ ...prev, status: "idle" })); setPipelineState(INITIAL_PIPELINE); return; }
    setPipelineState(prev => ({ ...prev, mapping: "done", rules: "active" }));

    addLog("info", `🔧 Limpieza por reglas de ${rawContacts.length} contactos...`);
    const { cleaned: ruleCleaned, aiIndices } = batchRuleClean(rawContacts);
    for (let i = 0; i < rawContacts.length; i++) {
      rawContacts[i].firstName = ruleCleaned[i].firstName;
      rawContacts[i].lastName = ruleCleaned[i].lastName;
      rawContacts[i].email = ruleCleaned[i].email;
      rawContacts[i].whatsapp = ruleCleaned[i].whatsapp;
      rawContacts[i].company = ruleCleaned[i].company;
      rawContacts[i].jobTitle = ruleCleaned[i].jobTitle;
    }
    addLog("success", `✓ Reglas: ${rawContacts.length - aiIndices.length} limpios, ${aiIndices.length} necesitan IA`);
    setPipelineState(prev => ({ ...prev, rules: "done" }));

    let cleanedContacts = rawContacts;
    if (aiIndices.length > 0) {
      const aiContacts = aiIndices.map(i => rawContacts[i]);
      addLog("info", `🤖 Enviando ${aiContacts.length}/${rawContacts.length} a IA (${Math.round(aiIndices.length / rawContacts.length * 100)}%)`);
      const aiCleaned = await cleanWithAI(aiContacts);
      for (let j = 0; j < aiIndices.length; j++) rawContacts[aiIndices[j]] = aiCleaned[j];
      cleanedContacts = rawContacts;
    } else {
      addLog("info", "✓ Todos los contactos se limpiaron con reglas, IA omitida");
      setPipelineState(prev => ({ ...prev, cleaning: "done", verifying: "done", correcting: "done" }));
    }

    // ── Validation step (deterministic + AI for ambiguous cases) ──
    setPipelineState(prev => ({ ...prev, validation: "active" }));
    addLog("info", "🔍 Validando campos con reglas determinísticas...");
    let validatedCount = 0;
    let aiValidationCount = 0;
    const typedContacts = cleanedContacts as UnifiedContact[];

    // Deterministic validation for all contacts
    for (const contact of typedContacts) {
      const validation = validateContactFields(contact);
      contact.validationScore = validation.overallScore;
      contact.fieldValidations = validation.validations;
      validatedCount++;
    }

    // Find contacts that still need AI validation
    const needsAIValidation = typedContacts.filter(c => {
      const v = c.fieldValidations;
      return v && v.some(f => !f.isValid || f.score < 50);
    });

    if (needsAIValidation.length > 0) {
      addLog("info", `🤖 ${needsAIValidation.length} contactos necesitan validación con IA...`);
      clearValidationCache();

      const aiValidations = await validateBatchWithAI(
        needsAIValidation,
        (processed, total) => {
          if (processed % 20 === 0) {
            addLog("info", `🤖 Validación IA: ${processed}/${total}`);
          }
        }
      );

      for (const contact of needsAIValidation) {
        const aiResult = aiValidations.get(contact.id);
        if (aiResult) {
          contact.fieldValidations = aiResult;
          const totalScore = aiResult.reduce((sum, f) => sum + f.score, 0);
          contact.validationScore = Math.round(totalScore / aiResult.length);
          aiValidationCount++;
        }
      }
      addLog("success", `✓ Validación IA completada: ${aiValidationCount} contactos validados`);
    } else {
      addLog("info", "✓ Todos los contactos pasaron validación determinística");
    }

    setPipelineState(prev => ({ ...prev, validation: "done" }));

    // ── Dedup step ──
    setPipelineState(prev => ({ ...prev, dedup: "active" }));
    addLog("info", "Detectando duplicados con índice hash O(n)...");
    const contacts: UnifiedContact[] = [];
    const dedupIndex = new DedupIndex();
    for (let i = 0; i < cleanedContacts.length; i++) {
      const contact = cleanedContacts[i] as UnifiedContact;
      const dedupResult = dedupIndex.add(
        { id: contact.id, firstName: contact.firstName, lastName: contact.lastName, email: contact.email, whatsapp: contact.whatsapp }
      );
      contact.isDuplicate = dedupResult.isDuplicate;
      contact.duplicateOf = dedupResult.duplicateOf;
      contact.confidence = dedupResult.confidence;
      contacts.push(contact);
      if (i % 1000 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    setPipelineState(prev => ({ ...prev, dedup: "done" }));

    const unique = contacts.filter((c) => !c.isDuplicate);
    const dupes = contacts.filter((c) => c.isDuplicate);
    const aiCount = contacts.filter((c) => c.aiCleaned).length;
    setStats({ totalRows, processedRows: totalRows, uniqueContacts: unique.length, duplicatesFound: dupes.length, aiCleanedCount: aiCount, rowsPerSecond: Math.round(totalRows / ((Date.now() - startTime) / 1000)), startTime, status: "done" });
    addLog("success", `✓ Completado: ${unique.length} unicos, ${dupes.length} duplicados, ${aiCount} limpiados por IA`);
    toast.success(`Procesamiento completado: ${unique.length} contactos unicos`);
    onProcessingComplete(contacts);
  }, [files, mappings, addLog, onProcessingComplete, mode, singleProvider, stageConfig]);

  const progress = stats.totalRows > 0 ? (stats.processedRows / stats.totalRows) * 100 : 0;
  const isActive = stats.status === "processing" || stats.status === "cleaning";

  // Get pipeline step labels based on config
  const stageLabels = mode === "pipeline" ? {
    clean: getProviderName(stageConfig.clean),
    verify: getProviderName(stageConfig.verify),
    correct: getProviderName(stageConfig.correct),
  } : { clean: getProviderName(singleProvider), verify: "", correct: "" };

  return (
    <div className="space-y-4">
      <ColumnMapper mappings={mappings} sampleData={allRowsRef.current} onMappingChange={handleMappingChange} />

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
              {activeProviders.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {activeProviders.length} proveedores activos
                </Badge>
              )}
            </div>

            {/* Mode selector */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={mode === "pipeline" ? "default" : "outline"}
                className="h-8 text-xs gap-1.5"
                onClick={() => setMode("pipeline")}
              >
                <BrainCircuit className="h-3 w-3" />
                Pipeline 3 IAs
              </Button>
              <Button
                size="sm"
                variant={mode === "single" ? "default" : "outline"}
                className="h-8 text-xs gap-1.5"
                onClick={() => setMode("single")}
              >
                <Zap className="h-3 w-3" />
                Proveedor único
              </Button>
            </div>

            {/* Pipeline: 3 stage selectors */}
            {mode === "pipeline" && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Configuración del pipeline</p>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1"
                    onClick={() => { const s = suggestOptimalConfig(activeProviders); setStageConfig(s); toast.success("Configuración óptima sugerida"); }}>
                    <Shuffle className="h-3 w-3" /> Sugerir óptimo
                  </Button>
                </div>
                {(["clean", "verify", "correct"] as const).map((stage) => (
                  <div key={stage} className="flex items-center gap-2">
                    <div className="w-[110px] shrink-0">
                      <p className="text-[11px] font-medium flex items-center gap-1">
                        {STAGE_INFO[stage].icon} {STAGE_INFO[stage].label}
                      </p>
                      <p className="text-[9px] text-muted-foreground">{STAGE_INFO[stage].desc}</p>
                    </div>
                    <Select value={stageConfig[stage]} onValueChange={(v) => setStageConfig(prev => ({ ...prev, [stage]: v }))}>
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {activeProviders.length > 0 ? activeProviders.map(p => (
                          <SelectItem key={p} value={p} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              {PROVIDER_ICONS[p] || <Zap className="h-3 w-3" />}
                              {getProviderName(p)}
                            </span>
                          </SelectItem>
                        )) : (
                          <SelectItem value="groq" className="text-xs text-muted-foreground" disabled>
                            Sin keys configuradas
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                {activeProviders.length === 0 && (
                  <p className="text-[10px] text-yellow-600 mt-1">
                    ⚠️ Configurá al menos 1 API key en la pestaña Config para usar el pipeline.
                  </p>
                )}
              </div>
            )}

            {/* Single: 1 selector */}
            {mode === "single" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Proveedor:</span>
                <Select value={singleProvider} onValueChange={setSingleProvider}>
                  <SelectTrigger className="h-8 text-xs w-[280px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        <span className="flex items-center gap-1.5">
                          {PROVIDER_ICONS[p.id] || <Zap className="h-3 w-3" />}
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Pipeline visual tracker */}
          {mode === "pipeline" && (isActive || stats.status === "done") && (
            <div className="rounded-lg border bg-card/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-3">Pipeline de procesamiento</p>
              <div className="flex items-center gap-1 flex-wrap">
                <PipelineStep icon={<Play className="h-3 w-3" />} label="Mapeo" state={pipelineState.mapping} />
                <PipelineConnector active={pipelineState.mapping === "done"} />
                <PipelineStep icon={<Wrench className="h-3 w-3" />} label="Reglas" sublabel="Limpieza rápida" state={pipelineState.rules} />
                <PipelineConnector active={pipelineState.rules === "done"} />
                <PipelineStep icon={PROVIDER_ICONS[stageConfig.clean] || <Zap className="h-3 w-3" />} label={stageLabels.clean} sublabel="IA Limpieza" state={pipelineState.cleaning} />
                <PipelineConnector active={pipelineState.cleaning === "done"} />
                <PipelineStep icon={PROVIDER_ICONS[stageConfig.verify] || <Globe className="h-3 w-3" />} label={stageLabels.verify} sublabel="Verificación" state={pipelineState.verifying} />
                <PipelineConnector active={pipelineState.verifying === "done"} />
                <PipelineStep icon={PROVIDER_ICONS[stageConfig.correct] || <Bot className="h-3 w-3" />} label={stageLabels.correct} sublabel="Corrección" state={pipelineState.correcting} />
                <PipelineConnector active={pipelineState.correcting === "done"} />
                <PipelineStep icon={<Shield className="h-3 w-3" />} label="Validar" sublabel="Score + IA" state={pipelineState.validation} />
                <PipelineConnector active={pipelineState.validation === "done"} />
                <PipelineStep icon={<CheckCircle2 className="h-3 w-3" />} label="Dedup" state={pipelineState.dedup} />
              </div>
            </div>
          )}

          {/* Single provider visual */}
          {mode === "single" && isActive && (
            <div className="rounded-lg border bg-card/50 p-3">
              <div className="flex items-center gap-2 text-xs">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-muted-foreground">
                  {stats.status === "cleaning" ? `${getProviderName(singleProvider)} procesando...` : "Mapeando columnas..."}
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
                addLog("info", "🧹 Limpieza completada");
                toast.success("Estado limpiado");
              }}>
                <Trash2 className="h-4 w-4" /> Clean Up
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
                  <RotateCcw className="h-4 w-4" /> Reset All
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={startProcessing} disabled={isActive || files.length === 0}>
                {isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {isActive ? "Procesando..." : stats.status === "done" ? "Reprocesar" : "Iniciar"}
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
            <StatCard label="Únicos" value={stats.uniqueContacts} color="text-green-600" />
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
                    <span className={log.type === "error" ? "text-destructive" : log.type === "success" ? "text-green-600" : log.type === "warning" ? "text-yellow-600" : ""}>
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
      <div className="flex items-center gap-1">{stateIcon}</div>
      <span className="text-[9px] font-medium leading-none">{label}</span>
      {sublabel && <span className="text-[8px] opacity-70 leading-none">{sublabel}</span>}
    </div>
  );
}

function PipelineConnector({ active }: { active: boolean }) {
  return <div className={`h-0.5 w-3 shrink-0 rounded-full transition-colors duration-500 ${active ? "bg-green-500" : "bg-muted"}`} />;
}

function StatCard({ label, value, total, color }: { label: string; value: number | string; total?: number; color?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <p className={`text-lg font-bold ${color || "text-foreground"}`}>{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-xs text-muted-foreground">{label}{total != null && ` / ${total.toLocaleString()}`}</p>
    </div>
  );
}
