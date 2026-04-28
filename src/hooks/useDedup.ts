/**
 * useDedup — Deduplication logic using Web Workers for large datasets.
 * Extracted from useContactProcessing for separation of concerns.
 */

import { useCallback } from "react";
import { runDedupInWorker } from "@/workers/useWorkerPipeline";
import type { UnifiedContact, ProcessingLog } from "@/types/contact";

interface UseDedupOptions {
  addLog: (type: ProcessingLog["type"], message: string) => void;
}

/**
 * Hook that provides deduplication functions.
 * Uses Web Workers for datasets > 10K records, inline for smaller ones.
 */
export function useDedup(options: UseDedupOptions) {
  const { addLog } = options;

  /**
   * Deduplicate contacts using hash index O(n).
   * Marks duplicates with isDuplicate, duplicateOf, and confidence fields.
   */
  const deduplicate = useCallback(async (contacts: UnifiedContact[]): Promise<UnifiedContact[]> => {
    addLog("info", "Detectando duplicados con índice hash O(n)...");
    const result: UnifiedContact[] = [];

    const dedupResults = await runDedupInWorker(
      contacts as unknown as Record<string, string>[],
      (processed, total) => {
        if (processed % 10000 === 0) addLog("info", `🔍 Dedup: ${processed.toLocaleString()}/${total.toLocaleString()}`);
      }
    );

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const dedupResult = dedupResults[i];
      contact.isDuplicate = dedupResult.isDuplicate;
      contact.duplicateOf = dedupResult.duplicateOf;
      contact.confidence = dedupResult.confidence;
      result.push(contact);
    }

    return result;
  }, [addLog]);

  return { deduplicate };
}
