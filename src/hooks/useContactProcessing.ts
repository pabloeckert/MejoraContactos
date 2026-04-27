import { useCallback, useMemo, useRef, useState } from "react";
import { DedupIndex } from "@/lib/dedup";
import { batchRuleClean } from "@/lib/rule-cleaner";
import { validateBatchWithAI, clearValidationCache } from "@/lib/ai-validator";
import { validateContactFields } from "@/lib/field-validator";
import { clearContacts, saveHistorySnapshot, getAllContacts } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { getActiveKeysMulti } from "@/lib/api-keys";
import { autoDetectMappings } from "@/lib/column-mapper";
import { runRuleCleanInWorker, runDedupInWorker } from "@/workers/useWorkerPipeline";
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

export interface StageConfig {
  clean: string;
  verify: string;
  correct: string;
}

export const INITIAL_PIPELINE: PipelineState = {
  mapping: "idle", rules: "idle", cleaning: "idle",
  verifying: "idle", correcting: "idle", validation: "idle", dedup: "idle",
};

export function suggestOptimalConfig(activeProviders: string[]): StageConfig {
  const cleanPriority = ["groq", "cerebras", "sambanova", "deepinfra", "together", "mistral", "openrouter", "deepseek", "gemini", "cloudflare", "huggingface", "nebius"];
  const verifyPriority = ["openrouter", "mistral", "deepseek", "gemini", "together", "groq", "cerebras", "deepinfra", "sambanova", "cloudflare", "huggingface", "nebius"];
  const correctPriority = ["gemini", "openrouter", "deepseek", "groq", "mistral", "together", "cerebras", "deepinfra", "sambanova", "cloudflare", "huggingface", "nebius"];

  const pick = (priority: string[], used: Set<string>): string => {
    for (const p of priority) {
      if (activeProviders.includes(p) && !used.has(p)) return p;
    }
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
  const filesKey = useMemo(() => files.map(f => f.id).join(","), [files]);
  useMemo(() => { allRowsRef.current = files.flatMap((f) => f.rows); }, [files]);

  const activeKeys = useMemo(() => getActiveKeysMulti(), []);
  const activeProviders = useMemo(() => Object.keys(activeKeys).filter(k => activeKeys[k].length > 0), [activeKeys]);
  const activeProvidersKey = activeProviders.join(",");

  // Auto-suggest optimal config on first load or when providers change
  const lastProvidersRef = useRef<string>("");
  if (activeProvidersKey !== lastProvidersRef.current && activeProviders.length > 0) {
    lastProvidersRef.current = activeProvidersKey;
    const suggested = suggestOptimalConfig(activeProviders);
    setStageConfig(suggested);
  }

  const addLog = useCallback((type: ProcessingLog["type"], message: string) => {
    setLogs((prev) => [{ id: crypto.randomUUID(), timestamp: new Date(), type, message }, ...prev.slice(0, 199)]);
  }, []);

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

  const cleanWithAI = useCallback(async (contacts: Partial<UnifiedContact>[]): Promise<Partial<UnifiedContact>[]> => {
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

        const body: Record<string, unknown> = {
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
  }, [mode, singleProvider, stageConfig, addLog]);

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

    // Validation
    setPipelineState(prev => ({ ...prev, validation: "active" }));
    addLog("info", "🔍 Validando campos con reglas determinísticas...");
    const typedContacts = cleanedContacts as UnifiedContact[];

    for (const contact of typedContacts) {
      const validation = validateContactFields(contact, defaultCountry as CountryCode);
      contact.validationScore = validation.overallScore;
      contact.fieldValidations = validation.validations;
    }

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
          if (processed % 20 === 0) addLog("info", `🤖 Validación IA: ${processed}/${total}`);
        }
      );

      let aiValidationCount = 0;
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

    // Dedup — offloaded to worker for large datasets
    setPipelineState(prev => ({ ...prev, dedup: "active" }));
    addLog("info", "Detectando duplicados con índice hash O(n)...");
    const contacts: UnifiedContact[] = [];

    const dedupResults = await runDedupInWorker(
      cleanedContacts as unknown as Record<string, string>[],
      (processed, total) => {
        if (processed % 10000 === 0) addLog("info", `🔍 Dedup: ${processed.toLocaleString()}/${total.toLocaleString()}`);
      }
    );

    for (let i = 0; i < cleanedContacts.length; i++) {
      const contact = cleanedContacts[i] as UnifiedContact;
      const dedupResult = dedupResults[i];
      contact.isDuplicate = dedupResult.isDuplicate;
      contact.duplicateOf = dedupResult.duplicateOf;
      contact.confidence = dedupResult.confidence;
      contacts.push(contact);
    }
    setPipelineState(prev => ({ ...prev, dedup: "done" }));

    const unique = contacts.filter((c) => !c.isDuplicate);
    const dupes = contacts.filter((c) => c.isDuplicate);
    const aiCount = contacts.filter((c) => c.aiCleaned).length;
    setStats({ totalRows, processedRows: totalRows, uniqueContacts: unique.length, duplicatesFound: dupes.length, aiCleanedCount: aiCount, rowsPerSecond: Math.round(totalRows / ((Date.now() - startTime) / 1000)), startTime, status: "done" });
    addLog("success", `✓ Completado: ${unique.length} unicos, ${dupes.length} duplicados, ${aiCount} limpiados por IA`);
    toast.success(`Procesamiento completado: ${unique.length} contactos unicos`);
    onComplete(contacts);
  }, [files, mappings, addLog, defaultCountry, cleanWithAI]);

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
