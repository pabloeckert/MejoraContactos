/**
 * useContactProcessing — Main pipeline orchestrator.
 * Delegates AI logic to useAIPipeline and dedup to useDedup.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { clearContacts, saveHistorySnapshot, getAllContacts } from "@/lib/db";
import { autoDetectMappings } from "@/lib/column-mapper";
import { runRuleCleanInWorker } from "@/workers/useWorkerPipeline";
import { useAIPipeline, suggestOptimalConfig, type StageConfig } from "./useAIPipeline";
import { useDedup } from "./useDedup";
import type { CountryCode } from "libphonenumber-js";
import type {
  ParsedFile,
  ColumnMapping,
  ContactField,
  UnifiedContact,
  ProcessingStats,
  ProcessingLog,
} from "@/types/contact";
import { toast } from "sonner";

export type PipelineStage = "idle" | "active" | "done" | "error";

export interface PipelineState {
  mapping: PipelineStage;
  rules: PipelineStage;
  cleaning: PipelineStage;
  verifying: PipelineStage;
  correcting: PipelineStage;
  validation: PipelineStage;
  dedup: PipelineStage;
}

export const INITIAL_PIPELINE: PipelineState = {
  mapping: "idle", rules: "idle", cleaning: "idle",
  verifying: "idle", correcting: "idle", validation: "idle", dedup: "idle",
};

// Re-export for backward compatibility
export type { StageConfig };
export { suggestOptimalConfig } from "./useAIPipeline";

export function useContactProcessing(files: ParsedFile[]) {
  const [mode, setMode] = useState<"single" | "pipeline">("pipeline");
  const [singleProvider, setSingleProvider] = useState<string>("groq");
  const [stageConfig, setStageConfig] = useState<StageConfig>({ clean: "groq", verify: "openrouter", correct: "gemini" });
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [pipelineState, setPipelineState] = useState<PipelineState>(INITIAL_PIPELINE);
  const [defaultCountry, setDefaultCountry] = useState<string>("AR");
  const [stats, setStats] = useState<ProcessingStats>({
    totalRows: 0, processedRows: 0, uniqueContacts: 0, duplicatesFound: 0,
    aiCleanedCount: 0, rowsPerSecond: 0, startTime: 0, status: "idle",
  });
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const pauseRef = useRef(false);
  const stopRef = useRef(false);

  const allColumns = useMemo(() => [...new Set(files.flatMap((f) => f.columns))], [files]);
  const allRowsRef = useRef<Record<string, string>[]>([]);
  useMemo(() => { allRowsRef.current = files.flatMap((f) => f.rows); }, [files]);

  const addLog = useCallback((type: ProcessingLog["type"], message: string) => {
    setLogs((prev) => [{ id: crypto.randomUUID(), timestamp: new Date(), type, message }, ...prev.slice(0, 199)]);
  }, []);

  // Delegate to sub-hooks
  const { cleanWithAI, validateWithAI, activeProviders } = useAIPipeline({
    mode, singleProvider, stageConfig, addLog,
    setPipelineState: setPipelineState as (fn: (prev: PipelineState) => PipelineState) => void,
    setStats: setStats as (fn: (prev: { aiCleanedCount: number; status: string }) => { aiCleanedCount: number; status: string }) => void,
    stopRef,
  });

  const { deduplicate } = useDedup({ addLog });

  // Auto-suggest optimal config when providers change
  const lastProvidersRef = useRef<string>("");
  const activeProvidersKey = activeProviders.join(",");
  if (activeProvidersKey !== lastProvidersRef.current && activeProviders.length > 0) {
    lastProvidersRef.current = activeProvidersKey;
    setStageConfig(suggestOptimalConfig(activeProviders));
  }

  // Auto-detect mappings when files change
  const mappedRef = useRef(false);
  if (files.length > 0 && mappings.length === 0 && !mappedRef.current) {
    mappedRef.current = true;
    const detected = autoDetectMappings(allColumns);
    setMappings(detected);
    const mapped = detected.filter((m) => m.target !== "ignore").length;
    addLog("info", `${mapped}/${allColumns.length} columnas mapeadas automaticamente`);
  }

  const handleMappingChange = useCallback((index: number, target: ContactField) => {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, target } : m)));
  }, []);

  const startProcessing = useCallback(async (onComplete: (contacts: UnifiedContact[]) => void) => {
    stopRef.current = false;
    pauseRef.current = false;
    const totalRows = allRowsRef.current.length;
    const startTime = Date.now();
    setPipelineState({ ...INITIAL_PIPELINE, mapping: "active" });
    setStats({ totalRows, processedRows: 0, uniqueContacts: 0, duplicatesFound: 0, aiCleanedCount: 0, rowsPerSecond: 0, startTime, status: "processing" });
    addLog("info", `Iniciando procesamiento de ${totalRows} filas...`);

    // Save snapshot to history before processing (for undo)
    try {
      const existingContacts = await getAllContacts();
      if (existingContacts.length > 0) {
        await saveHistorySnapshot("clean", `Pre-limpieza (${existingContacts.length} contactos)`, existingContacts);
        addLog("info", `📸 Snapshot guardado en historial (${existingContacts.length} contactos)`);
      }
    } catch (err) {
      addLog("warning", `No se pudo guardar snapshot: ${err}`);
    }

    // ── Stage 1: Parse rows into contacts ──
    const rawContacts: Partial<UnifiedContact>[] = [];
    const activeMappings = mappings.filter((m) => m.target !== "ignore");
    const rowSourceMap = new WeakMap<Record<string, string>, string>();
    for (const f of files) for (const row of f.rows) rowSourceMap.set(row, f.name);

    for (let i = 0; i < allRowsRef.current.length; i++) {
      if (stopRef.current) { addLog("warning", "Procesamiento detenido"); break; }
      while (pauseRef.current) await new Promise((r) => setTimeout(r, 100));

      const row = allRowsRef.current[i];
      const contact: Partial<UnifiedContact> = { id: crypto.randomUUID(), source: rowSourceMap.get(row) || "unknown", aiCleaned: false };
      for (const mapping of activeMappings) {
        const rawVal = row[mapping.source];
        (contact as Record<string, string>)[mapping.target] = typeof rawVal === "string" ? rawVal.trim() : String(rawVal ?? "");
      }
      contact.firstName = contact.firstName || "";
      contact.lastName = contact.lastName || "";
      contact.whatsapp = contact.whatsapp || "";
      contact.company = contact.company || "";
      contact.jobTitle = contact.jobTitle || "";
      contact.email = contact.email || "";
      if (!contact.firstName && !contact.lastName && !contact.email && !contact.whatsapp) continue;
      rawContacts.push(contact);

      if (i % 500 === 0 || i === allRowsRef.current.length - 1) {
        const elapsed = (Date.now() - startTime) / 1000;
        setStats(prev => ({ ...prev, processedRows: i + 1, rowsPerSecond: Math.round((i + 1) / elapsed) }));
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (stopRef.current) { setStats(prev => ({ ...prev, status: "idle" })); setPipelineState(INITIAL_PIPELINE); return; }
    setPipelineState(prev => ({ ...prev, mapping: "done", rules: "active" }));

    // ── Stage 2: Rule-based cleaning ──
    addLog("info", `🔧 Limpieza por reglas de ${rawContacts.length} contactos...`);
    const { cleaned: ruleCleaned, aiIndices } = await runRuleCleanInWorker(
      rawContacts as Record<string, string>[],
      (processed, total) => {
        if (processed % 10000 === 0) addLog("info", `🔧 Reglas: ${processed.toLocaleString()}/${total.toLocaleString()}`);
      }
    );
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

    // ── Stage 3: AI cleaning (delegated to useAIPipeline) ──
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

    // ── Stage 4: Validation (delegated to useAIPipeline) ──
    setPipelineState(prev => ({ ...prev, validation: "active" }));
    const typedContacts = cleanedContacts as UnifiedContact[];
    await validateWithAI(typedContacts, defaultCountry as CountryCode, addLog);
    setPipelineState(prev => ({ ...prev, validation: "done" }));

    // ── Stage 5: Deduplication (delegated to useDedup) ──
    setPipelineState(prev => ({ ...prev, dedup: "active" }));
    const contacts = await deduplicate(typedContacts);
    setPipelineState(prev => ({ ...prev, dedup: "done" }));

    // ── Final stats ──
    const unique = contacts.filter((c) => !c.isDuplicate);
    const dupes = contacts.filter((c) => c.isDuplicate);
    const aiCount = contacts.filter((c) => c.aiCleaned).length;
    setStats({ totalRows, processedRows: totalRows, uniqueContacts: unique.length, duplicatesFound: dupes.length, aiCleanedCount: aiCount, rowsPerSecond: Math.round(totalRows / ((Date.now() - startTime) / 1000)), startTime, status: "done" });
    addLog("success", `✓ Completado: ${unique.length} unicos, ${dupes.length} duplicados, ${aiCount} limpiados por IA`);
    toast.success(`Procesamiento completado: ${unique.length} contactos unicos`);
    onComplete(contacts);
  }, [files, mappings, addLog, defaultCountry, cleanWithAI, validateWithAI, deduplicate]);

  const pause = useCallback(() => {
    pauseRef.current = !pauseRef.current;
    setStats((p) => ({ ...p, status: pauseRef.current ? "paused" : "processing" }));
  }, []);

  const stop = useCallback(() => { stopRef.current = true; }, []);

  const resetState = useCallback(() => {
    stopRef.current = true;
    setLogs([]);
    setStats({ totalRows: 0, processedRows: 0, uniqueContacts: 0, duplicatesFound: 0, aiCleanedCount: 0, rowsPerSecond: 0, startTime: 0, status: "idle" });
    setPipelineState(INITIAL_PIPELINE);
    mappedRef.current = false;
  }, []);

  const cleanUp = useCallback(async () => {
    await clearContacts();
    resetState();
    addLog("info", "🧹 Limpieza completada");
    toast.success("Estado limpiado");
  }, [resetState, addLog]);

  const progress = stats.totalRows > 0 ? (stats.processedRows / stats.totalRows) * 100 : 0;
  const isActive = stats.status === "processing" || stats.status === "cleaning";

  return {
    // State
    mode, setMode,
    singleProvider, setSingleProvider,
    stageConfig, setStageConfig,
    mappings,
    pipelineState,
    defaultCountry, setDefaultCountry,
    stats,
    logs,
    activeProviders,
    allColumns,
    allRowsRef,
    progress,
    isActive,
    // Actions
    handleMappingChange,
    startProcessing,
    pause,
    stop,
    resetState,
    cleanUp,
    addLog,
  };
}
