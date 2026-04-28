/**
 * useAIPipeline — AI cleaning and validation logic.
 * Extracted from useContactProcessing for separation of concerns.
 */

import { useCallback, useMemo, useRef } from "react";
import { validateBatchWithAI, clearValidationCache } from "@/lib/ai-validator";
import { validateContactFields } from "@/lib/field-validator";
import { supabase } from "@/integrations/supabase/client";
import { getActiveKeysMulti } from "@/lib/api-keys";
import type { CountryCode } from "libphonenumber-js";
import type { UnifiedContact, ProcessingLog } from "@/types/contact";
import type { PipelineState, PipelineStage } from "./useContactProcessing";
import { toast } from "sonner";

export interface StageConfig {
  clean: string;
  verify: string;
  correct: string;
}

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

interface UseAIPipelineOptions {
  mode: "single" | "pipeline";
  singleProvider: string;
  stageConfig: StageConfig;
  addLog: (type: ProcessingLog["type"], message: string) => void;
  setPipelineState: (fn: (prev: PipelineState) => PipelineState) => void;
  setStats: (fn: (prev: { aiCleanedCount: number; status: string }) => { aiCleanedCount: number; status: string }) => void;
  stopRef: React.MutableRefObject<boolean>;
}

/**
 * Hook that provides AI cleaning and validation functions.
 * Handles batch processing, provider rotation, and pipeline stage tracking.
 */
export function useAIPipeline(options: UseAIPipelineOptions) {
  const { mode, singleProvider, stageConfig, addLog, setPipelineState, setStats, stopRef } = options;

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
  }, [mode, singleProvider, stageConfig, addLog, setPipelineState, setStats, stopRef]);

  const validateWithAI = useCallback(async (
    contacts: UnifiedContact[],
    defaultCountry: CountryCode,
    addLog: (type: ProcessingLog["type"], message: string) => void
  ): Promise<UnifiedContact[]> => {
    addLog("info", "🔍 Validando campos con reglas determinísticas...");

    for (const contact of contacts) {
      const validation = validateContactFields(contact, defaultCountry);
      contact.validationScore = validation.overallScore;
      contact.fieldValidations = validation.validations;
    }

    const needsAIValidation = contacts.filter(c => {
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

    return contacts;
  }, []);

  const activeKeys = useMemo(() => getActiveKeysMulti(), []);
  const activeProviders = useMemo(() => Object.keys(activeKeys).filter(k => activeKeys[k].length > 0), [activeKeys]);

  return {
    cleanWithAI,
    validateWithAI,
    activeProviders,
    activeKeys,
  };
}
