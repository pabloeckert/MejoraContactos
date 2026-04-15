import { useCallback, useRef, useState } from "react";
import { Play, Pause, Square, Loader2, Sparkles, Zap, Globe, Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ColumnMapper } from "./ColumnMapper";
import { autoDetectMappings } from "@/lib/column-mapper";
import { checkDuplicate } from "@/lib/dedup";
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
}

export function ProcessingPanel({ files, onProcessingComplete }: ProcessingPanelProps) {
  const [aiProvider, setAiProvider] = useState<string>("groq");
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [stats, setStats] = useState<ProcessingStats>({
    totalRows: 0, processedRows: 0, uniqueContacts: 0, duplicatesFound: 0,
    aiCleanedCount: 0, rowsPerSecond: 0, startTime: 0, status: "idle",
  });
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const pauseRef = useRef(false);
  const stopRef = useRef(false);

  const allColumns = [...new Set(files.flatMap((f) => f.columns))];
  const allRows = files.flatMap((f) => f.rows);

  const addLog = useCallback((type: ProcessingLog["type"], message: string) => {
    setLogs((prev) => [
      { id: crypto.randomUUID(), timestamp: new Date(), type, message },
      ...prev.slice(0, 199),
    ]);
  }, []);

  const initMappings = useCallback(() => {
    const detected = autoDetectMappings(allColumns);
    setMappings(detected);
    const mapped = detected.filter((m) => m.target !== "ignore").length;
    addLog("info", `${mapped}/${allColumns.length} columnas mapeadas automáticamente`);
  }, [allColumns, addLog]);

  if (files.length > 0 && mappings.length === 0) {
    initMappings();
  }

  const handleMappingChange = (index: number, target: ContactField) => {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, target } : m)));
  };

  const cleanWithAI = async (contacts: Partial<UnifiedContact>[]): Promise<Partial<UnifiedContact>[]> => {
    addLog("info", `🤖 Enviando ${contacts.length} contactos a IA para limpieza...`);
    setStats(prev => ({ ...prev, status: "cleaning" }));

    const BATCH_SIZE = 25;
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

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < contacts.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    addLog("success", `✨ IA limpió ${cleanedTotal} contactos exitosamente`);
    return result;
  };

  const startProcessing = useCallback(async () => {
    stopRef.current = false;
    pauseRef.current = false;
    const totalRows = allRows.length;
    const startTime = Date.now();
    setStats({ totalRows, processedRows: 0, uniqueContacts: 0, duplicatesFound: 0, aiCleanedCount: 0, rowsPerSecond: 0, startTime, status: "processing" });
    addLog("info", `Iniciando procesamiento de ${totalRows} filas...`);

    const rawContacts: Partial<UnifiedContact>[] = [];
    const activeMappings = mappings.filter((m) => m.target !== "ignore");

    // Phase 1: Map columns
    for (let i = 0; i < allRows.length; i++) {
      if (stopRef.current) { addLog("warning", "Procesamiento detenido"); break; }
      while (pauseRef.current) { await new Promise((r) => setTimeout(r, 100)); }

      const row = allRows[i];
      const contact: Partial<UnifiedContact> = {
        id: crypto.randomUUID(),
        source: files.find((f) => f.rows.includes(row))?.name || "unknown",
        aiCleaned: false,
      };

      for (const mapping of activeMappings) {
        const val = row[mapping.source]?.trim() || "";
        (contact as any)[mapping.target] = val;
      }

      contact.firstName = contact.firstName || "";
      contact.lastName = contact.lastName || "";
      contact.whatsapp = contact.whatsapp || "";
      contact.company = contact.company || "";
      contact.jobTitle = contact.jobTitle || "";
      contact.email = contact.email || "";

      // Skip completely empty rows
      if (!contact.firstName && !contact.lastName && !contact.email && !contact.whatsapp) continue;

      rawContacts.push(contact);

      if (i % 50 === 0 || i === allRows.length - 1) {
        const elapsed = (Date.now() - startTime) / 1000;
        setStats(prev => ({
          ...prev, processedRows: i + 1,
          rowsPerSecond: Math.round((i + 1) / elapsed),
        }));
      }
      if (i % 100 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    if (stopRef.current) {
      setStats(prev => ({ ...prev, status: "idle" }));
      return;
    }

    // Phase 2: AI cleaning
    let cleanedContacts = rawContacts;
    if (rawContacts.length > 0) {
      cleanedContacts = await cleanWithAI(rawContacts);
    }

    // Phase 3: Dedup
    addLog("info", "Detectando duplicados...");
    const contacts: UnifiedContact[] = [];
    for (const raw of cleanedContacts) {
      const contact = raw as UnifiedContact;
      const dedupResult = checkDuplicate(
        { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, whatsapp: contact.whatsapp },
        contacts
      );
      contact.isDuplicate = dedupResult.isDuplicate;
      contact.duplicateOf = dedupResult.duplicateOf;
      contact.confidence = dedupResult.confidence;
      contacts.push(contact);
    }

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
    addLog("success", `✓ Completado: ${unique.length} únicos, ${dupes.length} duplicados, ${aiCount} limpiados por IA`);
    toast.success(`Procesamiento completado: ${unique.length} contactos únicos`);
    onProcessingComplete(contacts);
  }, [allRows, files, mappings, addLog, onProcessingComplete]);

  const progress = stats.totalRows > 0 ? (stats.processedRows / stats.totalRows) * 100 : 0;
  const statusLabel = {
    idle: "Iniciar", processing: "Procesando...", cleaning: "🤖 IA limpiando...",
    paused: "Pausado", done: "Reprocesar", error: "Error",
  };

  return (
    <div className="space-y-4">
      <ColumnMapper mappings={mappings} sampleData={allRows.slice(0, 3)} onMappingChange={handleMappingChange} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              Procesamiento
              <Badge variant="outline" className="text-[10px] gap-1">
                <Sparkles className="h-3 w-3" /> IA integrada
              </Badge>
            </span>
            <div className="flex gap-2">
              <Button size="sm" onClick={startProcessing} disabled={stats.status === "processing" || stats.status === "cleaning" || files.length === 0}>
                {(stats.status === "processing" || stats.status === "cleaning") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
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
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
