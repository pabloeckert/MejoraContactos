import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { getActiveKeysMulti } from "@/lib/api-keys";
import { PROVIDERS } from "@/lib/providers";
import {
  Activity, CheckCircle2, XCircle, Loader2, RefreshCw, Zap,
  Clock, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

interface ProviderHealth {
  id: string;
  name: string;
  icon: string;
  status: "ok" | "error" | "testing" | "pending" | "no-key";
  latencyMs?: number;
  error?: string;
  model: string;
  keyCount: number;
}

const TEST_CONTACT = {
  firstName: "Test",
  lastName: "Health",
  email: "healthcheck@test.com",
  whatsapp: "+5491155550000",
};

export function HealthCheckPanel() {
  const [results, setResults] = useState<ProviderHealth[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const runHealthCheck = useCallback(async () => {
    const activeKeys = await getActiveKeysMulti();
    const providersToTest: ProviderHealth[] = PROVIDERS.map(p => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      status: (activeKeys[p.id]?.length > 0 ? "pending" : "no-key") as ProviderHealth["status"],
      model: p.freeModels,
      keyCount: activeKeys[p.id]?.length || 0,
    }));

    setResults(providersToTest);
    setRunning(true);
    setProgress(0);

    const withKeys = providersToTest.filter(p => p.keyCount > 0);
    let done = 0;

    for (const provider of withKeys) {
      setResults(prev => prev.map(p =>
        p.id === provider.id ? { ...p, status: "testing" as const } : p
      ));

      const start = Date.now();
      try {
        const { data, error } = await supabase.functions.invoke("clean-contacts", {
          body: {
            contacts: [TEST_CONTACT],
            provider: provider.id,
            customKeys: { [provider.id]: activeKeys[provider.id][0] },
          },
        });

        const latency = Date.now() - start;

        if (error || data?.error) {
          throw new Error(error?.message || data?.error);
        }

        setResults(prev => prev.map(p =>
          p.id === provider.id ? { ...p, status: "ok" as const, latencyMs: latency } : p
        ));
      } catch (err) {
        const latency = Date.now() - start;
        const msg = err instanceof Error ? err.message : "Error desconocido";
        setResults(prev => prev.map(p =>
          p.id === provider.id ? { ...p, status: "error" as const, latencyMs: latency, error: msg.slice(0, 80) } : p
        ));
      }

      done++;
      setProgress(Math.round((done / withKeys.length) * 100));
    }

    setRunning(false);

    // Use a callback ref to get latest results at toast time
    setResults(prev => {
      const ok = withKeys.length - prev.filter(p => p.status === "error").length;
      const err = prev.filter(p => p.status === "error").length;
      toast.info(`Health check: ${ok} OK, ${err} con error de ${withKeys.length} con keys`);
      return prev;
    });
  }, []);

  const okCount = results.filter(p => p.status === "ok").length;
  const errCount = results.filter(p => p.status === "error").length;
  const noKeyCount = results.filter(p => p.status === "no-key").length;
  const totalWithKeys = results.filter(p => p.status !== "no-key").length;
  const avgLatency = results.filter(p => p.latencyMs).reduce((a, p) => a + (p.latencyMs || 0), 0) / (results.filter(p => p.latencyMs).length || 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Health Check de Proveedores
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Testea todas tus API keys cargadas en un solo click. Verifica conectividad y latencia.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1"
            onClick={runHealthCheck}
            disabled={running}
          >
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {running ? "Testeando..." : "Ejecutar Health Check"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {results.length > 0 && (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg border p-2 text-center">
                <p className="text-lg font-bold text-green-500">{okCount}</p>
                <p className="text-[10px] text-muted-foreground">OK</p>
              </div>
              <div className="rounded-lg border p-2 text-center">
                <p className="text-lg font-bold text-red-500">{errCount}</p>
                <p className="text-[10px] text-muted-foreground">Error</p>
              </div>
              <div className="rounded-lg border p-2 text-center">
                <p className="text-lg font-bold text-muted-foreground">{noKeyCount}</p>
                <p className="text-[10px] text-muted-foreground">Sin key</p>
              </div>
              <div className="rounded-lg border p-2 text-center">
                <p className="text-lg font-bold">{Math.round(avgLatency)}ms</p>
                <p className="text-[10px] text-muted-foreground">Latencia avg</p>
              </div>
            </div>

            {/* Progress */}
            {running && (
              <div className="space-y-1">
                <Progress value={progress} className="h-2" />
                <p className="text-[10px] text-muted-foreground text-right">{progress}%</p>
              </div>
            )}

            {/* Provider list */}
            <div className="space-y-1.5">
              {results.map(p => (
                <div key={p.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <span className="text-sm">{p.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.model}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.keyCount > 0 && (
                      <Badge variant="outline" className="text-[10px]">{p.keyCount} key{p.keyCount > 1 ? "s" : ""}</Badge>
                    )}
                    {p.latencyMs && (
                      <Badge variant="outline" className="text-[10px]">
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        {p.latencyMs}ms
                      </Badge>
                    )}
                    {p.status === "ok" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {p.status === "error" && (
                      <div className="flex items-center gap-1">
                        <XCircle className="h-4 w-4 text-red-500" />
                        {p.error && (
                          <span className="text-[10px] text-red-500 max-w-[120px] truncate" title={p.error}>
                            {p.error}
                          </span>
                        )}
                      </div>
                    )}
                    {p.status === "testing" && <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />}
                    {p.status === "pending" && <Clock className="h-4 w-4 text-muted-foreground" />}
                    {p.status === "no-key" && (
                      <Badge variant="secondary" className="text-[10px]">Sin key</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Final verdict */}
            {!running && results.length > 0 && (
              <div className={`rounded-lg border p-3 flex items-center gap-2 ${
                errCount === 0 && okCount > 0
                  ? "bg-green-500/5 border-green-500/20"
                  : okCount === 0
                  ? "bg-red-500/5 border-red-500/20"
                  : "bg-yellow-500/5 border-yellow-500/20"
              }`}>
                {errCount === 0 && okCount > 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Todos los proveedores con keys están funcionando. Pipeline listo para usar.
                    </p>
                  </>
                ) : okCount === 0 ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <p className="text-xs text-red-700 dark:text-red-400">
                      Ningún proveedor responde. Verificá las keys en Config.
                    </p>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <p className="text-xs text-yellow-700 dark:text-yellow-400">
                      {okCount} de {totalWithKeys} proveedores OK. El pipeline rotará automáticamente a los que funcionan.
                    </p>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">Ejecutá el health check para ver el estado de tus proveedores</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
