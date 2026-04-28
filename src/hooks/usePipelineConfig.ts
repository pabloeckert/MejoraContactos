import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getActiveKeysMulti } from "@/lib/api-keys";
import { autoDetectMappings } from "@/lib/column-mapper";
import type { ParsedFile, ColumnMapping, ContactField, StageConfig } from "@/types/contact";

/**
 * Suggests optimal provider config based on available keys.
 * Uses priority lists to pick the best 3 distinct providers for the pipeline.
 */
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

/**
 * Hook that manages pipeline configuration: providers, mappings, country.
 * Extracted from useContactProcessing for better separation of concerns.
 */
export function usePipelineConfig(files: ParsedFile[]) {
  const [mode, setMode] = useState<"single" | "pipeline">("pipeline");
  const [singleProvider, setSingleProvider] = useState<string>("groq");
  const [stageConfig, setStageConfig] = useState<StageConfig>({ clean: "groq", verify: "openrouter", correct: "gemini" });
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [defaultCountry, setDefaultCountry] = useState<string>("AR");

  const allColumns = useMemo(() => [...new Set(files.flatMap((f) => f.columns))], [files]);
  const allRowsRef = useRef<Record<string, string>[]>([]);
  useMemo(() => { allRowsRef.current = files.flatMap((f) => f.rows); }, [files]);

  const initialKeys = (() => { try { const r = getActiveKeysMulti(); return r instanceof Promise ? {} : r; } catch { return {}; } })();
  const [activeKeys, setActiveKeys] = useState<Record<string, string[]>>(initialKeys);
  useEffect(() => { Promise.resolve(getActiveKeysMulti()).then(setActiveKeys).catch(() => {}); }, []);
  const activeProviders = useMemo(() => Object.keys(activeKeys).filter(k => activeKeys[k].length > 0), [activeKeys]);
  const activeProvidersKey = activeProviders.join(",");

  // Auto-suggest optimal config when providers change
  const lastProvidersRef = useRef<string>("");
  if (activeProvidersKey !== lastProvidersRef.current && activeProviders.length > 0) {
    lastProvidersRef.current = activeProvidersKey;
    const suggested = suggestOptimalConfig(activeProviders);
    setStageConfig(suggested);
  }

  const handleMappingChange = useCallback((index: number, target: ContactField) => {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, target } : m)));
  }, []);

  return {
    mode, setMode,
    singleProvider, setSingleProvider,
    stageConfig, setStageConfig,
    mappings, setMappings,
    defaultCountry, setDefaultCountry,
    allColumns,
    allRowsRef,
    activeKeys,
    activeProviders,
    handleMappingChange,
  };
}
