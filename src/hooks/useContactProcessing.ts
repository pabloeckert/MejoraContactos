/**
 * useContactProcessing — Main pipeline orchestrator.
 * Uses useReducer for structured state management.
 * Delegates AI logic to useAIPipeline and dedup to useDedup.
 */

import { useCallback, useMemo, useReducer, useRef } from "react";
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
import { checkContactLimit, checkBatchLimit, recordBatch } from "@/lib/usage-limits";

// ── Types ──

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

// ── Reducer State ──

interface ContactProcessingState {
  mode: "single" | "pipeline";
  singleProvider: string;
  stageConfig: StageConfig;
  mappings: ColumnMapping[];
  pipelineState: PipelineState;
  defaultCountry: string;
  stats: ProcessingStats;
  logs: ProcessingLog[];
}

// ── Reducer Actions ──

type ContactProcessingAction =
  | { type: "SET_MODE"; payload: "single" | "pipeline" }
  | { type: "SET_SINGLE_PROVIDER"; payload: string }
  | { type: "SET_STAGE_CONFIG"; payload: StageConfig }
  | { type: "SET_MAPPINGS"; payload: ColumnMapping[] }
  | { type: "UPDATE_MAPPING"; payload: { index: number; target: ContactField } }
  | { type: "SET_PIPELINE_STATE"; payload: PipelineState }
  | { type: "UPDATE_PIPELINE"; payload: Partial<PipelineState> }
  | { type: "SET_DEFAULT_COUNTRY"; payload: string }
  | { type: "SET_STATS"; payload: ProcessingStats }
  | { type: "UPDATE_STATS"; payload: Partial<ProcessingStats> }
  | { type: "ADD_LOG"; payload: ProcessingLog }
  | { type: "RESET" };

// ── Initial State ──

const INITIAL_STATS: ProcessingStats = {
  totalRows: 0, processedRows: 0, uniqueContacts: 0, duplicatesFound: 0,
  aiCleanedCount: 0, rowsPerSecond: 0, startTime: 0, status: "idle",
};

const initialState: ContactProcessingState = {
  mode: "pipeline",
  singleProvider: "groq",
  stageConfig: { clean: "groq", verify: "openrouter", correct: "gemini" },
  mappings: [],
  pipelineState: INITIAL_PIPELINE,
  defaultCountry: "AR",
  stats: INITIAL_STATS,
  logs: [],
};

// ── Reducer ──

function contactReducer(state: ContactProcessingState, action: ContactProcessingAction): ContactProcessingState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.payload };
    case "SET_SINGLE_PROVIDER":
      return { ...state, singleProvider: action.payload };
    case "SET_STAGE_CONFIG":
      return { ...state, stageConfig: action.payload };
    case "SET_MAPPINGS":
      return { ...state, mappings: action.payload };
    case "UPDATE_MAPPING":
      return {
        ...state,
        mappings: state.mappings.map((m, i) =>
          i === action.payload.index ? { ...m, target: action.payload.target } : m
        ),
      };
    case "SET_PIPELINE_STATE":
      return { ...state, pipelineState: action.payload };
    case "UPDATE_PIPELINE":
      return { ...state, pipelineState: { ...state.pipelineState, ...action.payload } };
    case "SET_DEFAULT_COUNTRY":
      return { ...state, defaultCountry: action.payload };
    case "SET_STATS":
      return { ...state, stats: action.payload };
    case "UPDATE_STATS":
      return { ...state, stats: { ...state.stats, ...action.payload } };
    case "ADD_LOG":
      return { ...state, logs: [action.payload, ...state.logs.slice(0, 199)] };
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

// ── Hook ──

export function useContactProcessing(files: ParsedFile[]) {
  const [state, dispatch] = useReducer(contactReducer, initialState);
  const pauseRef = useRef(false);
  const stopRef = useRef(false);
  const mappedRef = useRef(false);

  const allColumns = useMemo(() => [...new Set(files.flatMap((f) => f.columns))], [files]);
  const allRowsRef = useRef<Record<string, string>[]>([]);
  useMemo(() => { allRowsRef.current = files.flatMap((f) => f.rows); }, [files]);

  const addLog = useCallback((type: ProcessingLog["type"], message: string) => {
    dispatch({ type: "ADD_LOG", payload: { id: crypto.randomUUID(), timestamp: new Date(), type, message } });
  }, []);

  // Delegate to sub-hooks
  const { cleanWithAI, validateWithAI, activeProviders } = useAIPipeline({
    mode: state.mode,
    singleProvider: state.singleProvider,
    stageConfig: state.stageConfig,
    addLog,
    setPipelineState: (fn) => dispatch({ type: "SET_PIPELINE_STATE", payload: fn(state.pipelineState) }),
    setStats: (fn) => dispatch({ type: "SET_STATS", payload: fn(state.stats) as ProcessingStats }),
    stopRef,
  });

  const { deduplicate } = useDedup({ addLog });

  // Auto-suggest optimal config when providers change
  const lastProvidersRef = useRef<string>("");
  const activeProvidersKey = activeProviders.join(",");
  if (activeProvidersKey !== lastProvidersRef.current && activeProviders.length > 0) {
    lastProvidersRef.current = activeProvidersKey;
    dispatch({ type: "SET_STAGE_CONFIG", payload: suggestOptimalConfig(activeProviders) });
  }

  // Auto-detect mappings when files change
  if (files.length > 0 && state.mappings.length === 0 && !mappedRef.current) {
    mappedRef.current = true;
    const detected = autoDetectMappings(allColumns);
    dispatch({ type: "SET_MAPPINGS", payload: detected });
    const mapped = detected.filter((m) => m.target !== "ignore").length;
    addLog("info", `${mapped}/${allColumns.length} columnas mapeadas automaticamente`);
  }

  const handleMappingChange = useCallback((index: number, target: ContactField) => {
    dispatch({ type: "UPDATE_MAPPING", payload: { index, target } });
  }, []);

  const startProcessing = useCallback(async (onComplete: (contacts: UnifiedContact[]) => void) => {
    stopRef.current = false;
    pauseRef.current = false;
    const totalRows = allRowsRef.current.length;
    const startTime = Date.now();

    // ── Check usage limits ──
    const contactLimit = checkContactLimit(totalRows);
    if (!contactLimit.allowed) {
      toast.error(contactLimit.reason);
      addLog("error", contactLimit.reason!);
      dispatch({ type: "UPDATE_STATS", payload: { status: "idle" } });
      return;
    }
    const batchLimit = checkBatchLimit();
    if (!batchLimit.allowed) {
      toast.error(batchLimit.reason);
      addLog("error", batchLimit.reason!);
      dispatch({ type: "UPDATE_STATS", payload: { status: "idle" } });
      return;
    }

    dispatch({ type: "SET_PIPELINE_STATE", payload: { ...INITIAL_PIPELINE, mapping: "active" } });
    dispatch({ type: "SET_STATS", payload: { totalRows, processedRows: 0, uniqueContacts: 0, duplicatesFound: 0, aiCleanedCount: 0, rowsPerSecond: 0, startTime, status: "processing" } });
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
    const activeMappings = state.mappings.filter((m) => m.target !== "ignore");
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
        dispatch({ type: "UPDATE_STATS", payload: { processedRows: i + 1, rowsPerSecond: Math.round((i + 1) / elapsed) } });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (stopRef.current) {
      dispatch({ type: "UPDATE_STATS", payload: { status: "idle" } });
      dispatch({ type: "SET_PIPELINE_STATE", payload: INITIAL_PIPELINE });
      return;
    }
    dispatch({ type: "UPDATE_PIPELINE", payload: { mapping: "done", rules: "active" } });

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
    dispatch({ type: "UPDATE_PIPELINE", payload: { rules: "done" } });

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
      dispatch({ type: "UPDATE_PIPELINE", payload: { cleaning: "done", verifying: "done", correcting: "done" } });
    }

    // ── Stage 4: Validation (delegated to useAIPipeline) ──
    dispatch({ type: "UPDATE_PIPELINE", payload: { validation: "active" } });
    const typedContacts = cleanedContacts as UnifiedContact[];
    await validateWithAI(typedContacts, state.defaultCountry as CountryCode, addLog);
    dispatch({ type: "UPDATE_PIPELINE", payload: { validation: "done" } });

    // ── Stage 5: Deduplication (delegated to useDedup) ──
    dispatch({ type: "UPDATE_PIPELINE", payload: { dedup: "active" } });
    const contacts = await deduplicate(typedContacts);
    dispatch({ type: "UPDATE_PIPELINE", payload: { dedup: "done" } });

    // ── Final stats ──
    const unique = contacts.filter((c) => !c.isDuplicate);
    const dupes = contacts.filter((c) => c.isDuplicate);
    const aiCount = contacts.filter((c) => c.aiCleaned).length;
    dispatch({ type: "SET_STATS", payload: { totalRows, processedRows: totalRows, uniqueContacts: unique.length, duplicatesFound: dupes.length, aiCleanedCount: aiCount, rowsPerSecond: Math.round(totalRows / ((Date.now() - startTime) / 1000)), startTime, status: "done" } });
    addLog("success", `✓ Completado: ${unique.length} unicos, ${dupes.length} duplicados, ${aiCount} limpiados por IA`);
    recordBatch();
    toast.success(`Procesamiento completado: ${unique.length} contactos unicos`);
    onComplete(contacts);
  }, [files, state.mappings, state.defaultCountry, addLog, cleanWithAI, validateWithAI, deduplicate]);

  const pause = useCallback(() => {
    pauseRef.current = !pauseRef.current;
    dispatch({ type: "UPDATE_STATS", payload: { status: pauseRef.current ? "paused" : "processing" } });
  }, []);

  const stop = useCallback(() => { stopRef.current = true; }, []);

  const resetState = useCallback(() => {
    stopRef.current = true;
    dispatch({ type: "RESET" });
    mappedRef.current = false;
  }, []);

  const cleanUp = useCallback(async () => {
    await clearContacts();
    resetState();
    addLog("info", "🧹 Limpieza completada");
    toast.success("Estado limpiado");
  }, [resetState, addLog]);

  const progress = state.stats.totalRows > 0 ? (state.stats.processedRows / state.stats.totalRows) * 100 : 0;
  const isActive = state.stats.status === "processing" || state.stats.status === "cleaning";

  return {
    // State
    mode: state.mode, setMode: (m: "single" | "pipeline") => dispatch({ type: "SET_MODE", payload: m }),
    singleProvider: state.singleProvider, setSingleProvider: (p: string) => dispatch({ type: "SET_SINGLE_PROVIDER", payload: p }),
    stageConfig: state.stageConfig, setStageConfig: (c: StageConfig) => dispatch({ type: "SET_STAGE_CONFIG", payload: c }),
    mappings: state.mappings,
    pipelineState: state.pipelineState,
    defaultCountry: state.defaultCountry, setDefaultCountry: (c: string) => dispatch({ type: "SET_DEFAULT_COUNTRY", payload: c }),
    stats: state.stats,
    logs: state.logs,
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
