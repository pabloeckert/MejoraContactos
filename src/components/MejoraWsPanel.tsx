import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, CheckCircle2, XCircle, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getBridgeStatus,
  loadBridgeToken,
  saveBridgeToken,
  clearBridgeToken,
  MEJORAWS_PROTOCOL_URL,
  type BridgeStatus,
} from "@/lib/mejoraws-bridge";

const POLL_MS = 6000;

/**
 * Fase 3 de MejoraSuite: MejoraContactos embebe el estado de MejoraWS (no
 * el envío — eso todavía no existe en el bridge, ver mejorasuite/PENDIENTES.md
 * Fase 1b en el repo de MejoraCRM). MejoraWS sigue siendo su propia app de
 * escritorio; esto es solo un panel de estado + acceso rápido.
 */
export function MejoraWsPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    loadBridgeToken().then(setToken);
  }, []);

  const checkStatus = useCallback(async (t: string) => {
    setChecking(true);
    const s = await getBridgeStatus(t);
    setStatus(s);
    setChecking(false);
  }, []);

  useEffect(() => {
    if (!token) return;
    checkStatus(token);
    const interval = setInterval(() => checkStatus(token), POLL_MS);
    return () => clearInterval(interval);
  }, [token, checkStatus]);

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return;
    await saveBridgeToken(tokenInput);
    setToken(tokenInput.trim());
    setTokenInput("");
    toast.success("Token guardado");
  };

  const handleClearToken = () => {
    clearBridgeToken();
    setToken(null);
    setStatus(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4" />
          MejoraWS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          MejoraWS es la app de escritorio para campañas de WhatsApp — sigue siendo un producto aparte,
          esto solo muestra su estado acá sin tener que cambiar de ventana.
        </p>

        {!token ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Pegá acá el token que te da MejoraWS (botón "Copiar token de conexión" en su ventana, arriba a la derecha).
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Token de conexión"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveToken()}
              />
              <Button onClick={handleSaveToken} disabled={!tokenInput.trim()}>
                Guardar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {status ? (
                  <>
                    {status.connected ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm">
                      {status.connected ? "WhatsApp conectado" : `WhatsApp ${status.waStatus}`}
                    </span>
                    {status.campaignRunning && (
                      <Badge variant="secondary" className="text-xs">
                        {status.pauseRequested ? "Campaña pausada" : "Campaña enviando"}
                      </Badge>
                    )}
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {checking ? "Buscando MejoraWS..." : "MejoraWS no está corriendo"}
                    </span>
                  </>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={handleClearToken} title="Olvidar token guardado">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {!status && !checking && (
              <a href={MEJORAWS_PROTOCOL_URL}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir MejoraWS
                </Button>
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
