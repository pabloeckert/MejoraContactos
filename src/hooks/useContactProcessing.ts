/**
 * useContactProcessing — Main local pipeline orchestrator.
 * Uses useReducer for structured state management.
 * Pure client-side execution: mapping -> rules (Web Worker) -> validation -> dedup (Web Worker).
 */

import { useCallback, useMemo, useReducer, useRef } from "react";
import { clearContacts, saveHistorySnapshot, getAllContacts } from "@/lib/db";
import { autoDetectMappings } from "@/lib/column-mapper";
import { runRuleCleanInWorker } from "@/workers/useWorkerPipeline";
import { useDedup } from "./useDedup";
import { scoreRelevance, getSegment } from "@/lib/relevance-scorer";
import { validatePhone } from "@/lib/phone-validator";
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
  validation: PipelineStage;
  dedup: PipelineStage;
}

export const INITIAL_PIPELINE: PipelineState = {
  mapping: "idle",
  rules: "idle",
  validation: "idle",
  dedup: "idle",
};

interface ContactProcessingState {
  mappings: ColumnMapping[];
  pipelineState: PipelineState;
  defaultCountry: string;
  stats: ProcessingStats;
  logs: ProcessingLog[];
}

type ContactProcessingAction =
  | { type: "SET_MAPPINGS"; payload: ColumnMapping[] }
  | { type: "UPDATE_MAPPING"; payload: { index: number; target: ContactField } }
  | { type: "SET_PIPELINE_STATE"; payload: PipelineState }
  | { type: "UPDATE_PIPELINE"; payload: Partial<PipelineState> }
  | { type: "SET_DEFAULT_COUNTRY"; payload: string }
  | { type: "SET_STATS"; payload: ProcessingStats }
  | { type: "UPDATE_STATS"; payload: Partial<ProcessingStats> }
  | { type: "ADD_LOG"; payload: ProcessingLog }
  | { type: "RESET" };

const INITIAL_STATS: ProcessingStats = {
  totalRows: 0,
  processedRows: 0,
  uniqueContacts: 0,
  duplicatesFound: 0,
  aiCleanedCount: 0,
  rowsPerSecond: 0,
  startTime: 0,
  status: "idle",
};

const initialState: ContactProcessingState = {
  mappings: [],
  pipelineState: INITIAL_PIPELINE,
  defaultCountry: "AR",
  stats: INITIAL_STATS,
  logs: [],
};

function contactReducer(state: ContactProcessingState, action: ContactProcessingAction): ContactProcessingState {
  switch (action.type) {
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
      return { ...state, logs: [...state.logs.slice(-200), action.payload] };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export function useContactProcessing(files: ParsedFile[]) {
  const [state, dispatch] = useReducer(contactReducer, initialState);
  const stopRef = useRef(false);
  const pauseRef = useRef(false);
  const allRowsRef = useRef<Record<string, string>[]>([]);
  const mappedRef = useRef(false);

  const allColumns = useMemo(() => {
    const colSet = new Set<string>();
    const rows: Record<string, string>[] = [];
    for (const f of files) {
      f.columns.forEach((c) => colSet.add(c));
      rows.push(...f.rows);
    }
    allRowsRef.current = rows;
    return Array.from(colSet);
  }, [files]);

  const addLog = useCallback((type: ProcessingLog["type"], message: string) => {
    dispatch({
      type: "ADD_LOG",
      payload: { id: crypto.randomUUID(), timestamp: new Date(), type, message },
    });
  }, []);

  const { deduplicate } = useDedup({ addLog });

  if (files.length > 0 && state.mappings.length === 0 && !mappedRef.current) {
    mappedRef.current = true;
    const detected = autoDetectMappings(allColumns);
    dispatch({ type: "SET_MAPPINGS", payload: detected });
    const mapped = detected.filter((m) => m.target !== "ignore").length;
    addLog("info", `${mapped}/${allColumns.length} columnas mapeadas automáticamente`);
  }

  const handleMappingChange = useCallback((index: number, target: ContactField) => {
    dispatch({ type: "UPDATE_MAPPING", payload: { index, target } });
  }, []);

  const startProcessing = useCallback(
    async (onComplete: (contacts: UnifiedContact[]) => void) => {
      stopRef.current = false;
      pauseRef.current = false;
      const totalRows = allRowsRef.current.length;
      const startTime = Date.now();

      dispatch({ type: "SET_PIPELINE_STATE", payload: { ...INITIAL_PIPELINE, mapping: "active" } });
      dispatch({
        type: "SET_STATS",
        payload: {
          totalRows,
          processedRows: 0,
          uniqueContacts: 0,
          duplicatesFound: 0,
          aiCleanedCount: 0,
          rowsPerSecond: 0,
          startTime,
          status: "processing",
        },
      });
      addLog("info", `Iniciando procesamiento local de ${totalRows} filas...`);

      try {
        const existingContacts = await getAllContacts();
        if (existingContacts.length > 0) {
          await saveHistorySnapshot("clean", `Pre-limpieza (${existingContacts.length} contactos)`, existingContacts);
        }
      } catch (err) {
        addLog("warning", `No se pudo guardar snapshot: ${err}`);
      }

      const rawContacts: Partial<UnifiedContact>[] = [];
      const activeMappings = state.mappings.filter((m) => m.target !== "ignore");
      const rowSourceMap = new WeakMap<Record<string, string>, string>();
      for (const f of files) for (const row of f.rows) rowSourceMap.set(row, f.name);

      for (let i = 0; i < allRowsRef.current.length; i++) {
        if (stopRef.current) {
          addLog("warning", "Procesamiento detenido");
          break;
        }
        while (pauseRef.current) await new Promise((r) => setTimeout(r, 100));

        const row = allRowsRef.current[i];
        const contact: Partial<UnifiedContact> = {
          id: crypto.randomUUID(),
          source: rowSourceMap.get(row) || "unknown",
          aiCleaned: false,
        };
        for (const mapping of activeMappings) {
          const rawVal = row[mapping.source];
          (contact as Record<string, string>)[mapping.target] =
            typeof rawVal === "string" ? rawVal.trim() : String(rawVal ?? "");
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
          const elapsed = Math.max(0.001, (Date.now() - startTime) / 1000);
          dispatch({
            type: "UPDATE_STATS",
            payload: { processedRows: i + 1, rowsPerSecond: Math.round((i + 1) / elapsed) },
          });
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (stopRef.current) {
        dispatch({ type: "UPDATE_STATS", payload: { status: "idle" } });
        dispatch({ type: "SET_PIPELINE_STATE", payload: INITIAL_PIPELINE });
        return;
      }
      dispatch({ type: "UPDATE_PIPELINE", payload: { mapping: "done", rules: "active" } });

      addLog("info", `Limpieza y normalización de ${rawContacts.length} contactos...`);
      const { cleaned: ruleCleaned } = await runRuleCleanInWorker(
        rawContacts as Record<string, string>[],
        (processed, total) => {
          if (processed % 10000 === 0) addLog("info", `Reglas: ${processed.toLocaleString()}/${total.toLocaleString()}`);
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
      dispatch({ type: "UPDATE_PIPELINE", payload: { rules: "done", validation: "active" } });

      const country = (state.defaultCountry || "AR") as CountryCode;
      const typedContacts = rawContacts as UnifiedContact[];
      for (const c of typedContacts) {
        if (c.whatsapp) {
          const phoneRes = validatePhone(c.whatsapp, country);
          if (phoneRes.e164) c.whatsapp = phoneRes.e164;
        }
      }
      dispatch({ type: "UPDATE_PIPELINE", payload: { validation: "done", dedup: "active" } });

      const dedupedContacts = await deduplicate(typedContacts);
      dispatch({ type: "UPDATE_PIPELINE", payload: { dedup: "done" } });

      const contacts = dedupedContacts.map((c) => {
        const score = scoreRelevance(c);
        return { ...c, relevanceScore: score, segment: getSegment(score), needsAIScoring: false };
      });

      const unique = contacts.filter((c) => !c.isDuplicate);
      const dupes = contacts.filter((c) => c.isDuplicate);
      const elapsedSec = Math.max(0.001, (Date.now() - startTime) / 1000);
      dispatch({
        type: "SET_STATS",
        payload: {
          totalRows,
          processedRows: totalRows,
          uniqueContacts: unique.length,
          duplicatesFound: dupes.length,
          aiCleanedCount: 0,
          rowsPerSecond: Math.round(totalRows / elapsedSec),
          startTime,
          status: "done",
        },
      });
      addLog("success", `Completado: ${unique.length} únicos, ${dupes.length} duplicados`);
      toast.success(`Procesamiento completado: ${unique.length} contactos únicos`);
      onComplete(contacts);
    },
    [files, state.mappings, state.defaultCountry, addLog, deduplicate]
  );

  const pause = useCallback(() => {
    pauseRef.current = !pauseRef.current;
    dispatch({ type: "UPDATE_STATS", payload: { status: pauseRef.current ? "paused" : "processing" } });
  }, []);

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  const resetState = useCallback(() => {
    stopRef.current = true;
    dispatch({ type: "RESET" });
    mappedRef.current = false;
  }, []);

  const cleanUp = useCallback(async () => {
    await clearContacts();
    resetState();
    addLog("info", "Limpieza completada");
    toast.success("Estado limpiado");
  }, [resetState, addLog]);

  const progress = state.stats.totalRows > 0 ? (state.stats.processedRows / state.stats.totalRows) * 100 : 0;
  const isActive = state.stats.status === "processing" || state.stats.status === "cleaning";

  return {
    mappings: state.mappings,
    pipelineState: state.pipelineState,
    defaultCountry: state.defaultCountry,
    setDefaultCountry: (c: string) => dispatch({ type: "SET_DEFAULT_COUNTRY", payload: c }),
    stats: state.stats,
    logs: state.logs,
    allColumns,
    allRowsRef,
    progress,
    isActive,
    handleMappingChange,
    startProcessing,
    pause,
    stop,
    resetState,
    cleanUp,
    addLog,
  };
}
