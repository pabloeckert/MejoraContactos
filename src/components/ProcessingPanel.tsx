import { useCallback, useRef, useState } from "react";
import { Play, Pause, Square, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ColumnMapper } from "./ColumnMapper";
import { autoDetectMappings } from "@/lib/column-mapper";
import { validatePhone } from "@/lib/phone-utils";
import { checkDuplicate } from "@/lib/dedup";
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
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [stats, setStats] = useState<ProcessingStats>({
    totalRows: 0,
    processedRows: 0,
    uniqueContacts: 0,
    duplicatesFound: 0,
    invalidPhones: 0,
    rowsPerSecond: 0,
    startTime: 0,
    status: "idle",
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

  // Auto-init mappings when files change
  if (files.length > 0 && mappings.length === 0) {
    initMappings();
  }

  const handleMappingChange = (index: number, target: ContactField) => {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, target } : m)));
  };

  const startProcessing = useCallback(async () => {
    stopRef.current = false;
    pauseRef.current = false;

    const totalRows = allRows.length;
    const startTime = Date.now();
    setStats({ totalRows, processedRows: 0, uniqueContacts: 0, duplicatesFound: 0, invalidPhones: 0, rowsPerSecond: 0, startTime, status: "processing" });
    addLog("info", `Iniciando procesamiento de ${totalRows} filas...`);

    const contacts: UnifiedContact[] = [];
    const activeMappings = mappings.filter((m) => m.target !== "ignore");

    for (let i = 0; i < allRows.length; i++) {
      if (stopRef.current) {
        addLog("warning", "Procesamiento detenido por el usuario");
        break;
      }

      while (pauseRef.current) {
        await new Promise((r) => setTimeout(r, 100));
      }

      const row = allRows[i];
      const contact: Partial<UnifiedContact> = {
        id: crypto.randomUUID(),
        source: files.find((f) => f.rows.includes(row))?.name || "unknown",
      };

      for (const mapping of activeMappings) {
        const val = row[mapping.source]?.trim() || "";
        if (mapping.target === "fullName") {
          const parts = val.split(/\s+/);
          contact.firstName = parts[0] || "";
          contact.lastName = parts.slice(1).join(" ") || "";
        } else {
          (contact as any)[mapping.target] = val;
        }
      }

      // Fill defaults
      contact.firstName = contact.firstName || "";
      contact.lastName = contact.lastName || "";
      contact.email = contact.email || "";
      contact.phone = contact.phone || "";
      contact.phone2 = contact.phone2 || "";
      contact.company = contact.company || "";
      contact.jobTitle = contact.jobTitle || "";
      contact.address = contact.address || "";
      contact.city = contact.city || "";
      contact.state = contact.state || "";
      contact.country = contact.country || "";
      contact.zip = contact.zip || "";
      contact.notes = contact.notes || "";
      contact.website = contact.website || "";
      contact.birthday = contact.birthday || "";

      // Skip empty
      if (!contact.firstName && !contact.lastName && !contact.email && !contact.phone) {
        continue;
      }

      // Phone validation
      const phoneResult = validatePhone(contact.phone);
      contact.phoneValid = phoneResult.valid;
      contact.phoneFormatted = phoneResult.formatted;
      contact.countryCode = phoneResult.country;

      // Dedup
      const dedupResult = checkDuplicate(
        { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone },
        contacts
      );
      contact.isDuplicate = dedupResult.isDuplicate;
      contact.duplicateOf = dedupResult.duplicateOf;
      contact.confidence = dedupResult.confidence;

      contacts.push(contact as UnifiedContact);

      // Update stats every 50 rows
      if (i % 50 === 0 || i === allRows.length - 1) {
        const elapsed = (Date.now() - startTime) / 1000;
        setStats({
          totalRows,
          processedRows: i + 1,
          uniqueContacts: contacts.filter((c) => !c.isDuplicate).length,
          duplicatesFound: contacts.filter((c) => c.isDuplicate).length,
          invalidPhones: contacts.filter((c) => !c.phoneValid && c.phone).length,
          rowsPerSecond: Math.round((i + 1) / elapsed),
          startTime,
          status: pauseRef.current ? "paused" : "processing",
        });
      }

      // Yield to UI
      if (i % 100 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    const unique = contacts.filter((c) => !c.isDuplicate);
    const dupes = contacts.filter((c) => c.isDuplicate);

    setStats((prev) => ({ ...prev, status: "done", processedRows: totalRows }));
    addLog("success", `✓ Completado: ${unique.length} únicos, ${dupes.length} duplicados`);
    toast.success(`Procesamiento completado: ${unique.length} contactos únicos`);
    onProcessingComplete(contacts);
  }, [allRows, files, mappings, addLog, onProcessingComplete]);

  const progress = stats.totalRows > 0 ? (stats.processedRows / stats.totalRows) * 100 : 0;

  return (
    <div className="space-y-4">
      <ColumnMapper
        mappings={mappings}
        sampleData={allRows.slice(0, 3)}
        onMappingChange={handleMappingChange}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Procesamiento</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={startProcessing}
                disabled={stats.status === "processing" || files.length === 0}
              >
                {stats.status === "processing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {stats.status === "idle" ? "Iniciar" : stats.status === "done" ? "Reprocesar" : "Procesando..."}
              </Button>
              {stats.status === "processing" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      pauseRef.current = !pauseRef.current;
                      setStats((p) => ({ ...p, status: pauseRef.current ? "paused" : "processing" }));
                    }}
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => { stopRef.current = true; }}
                  >
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
            <StatCard label="Únicos" value={stats.uniqueContacts} color="text-green-400" />
            <StatCard label="Duplicados" value={stats.duplicatesFound} color="text-yellow-400" />
            <StatCard label="Vel." value={`${stats.rowsPerSecond}/s`} />
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
                    <span className="text-muted-foreground shrink-0">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <Badge
                      variant={log.type === "error" ? "destructive" : "outline"}
                      className="text-[10px] h-4 shrink-0"
                    >
                      {log.type}
                    </Badge>
                    <span className={
                      log.type === "error" ? "text-destructive" :
                      log.type === "success" ? "text-green-400" :
                      log.type === "warning" ? "text-yellow-400" : ""
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
    <div className="rounded-md bg-secondary/50 p-3 text-center">
      <p className={`text-lg font-bold ${color || ""}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-muted-foreground">
        {label}
        {total != null && ` / ${total.toLocaleString()}`}
      </p>
    </div>
  );
}
