import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Key, TestTube, CheckCircle2, XCircle, Loader2, ExternalLink, Trash2, Eye, EyeOff,
} from "lucide-react";

export interface ProviderInfo {
  id: string;
  name: string;
  url: string;
  signupUrl: string;
  freeModels: string;
  icon: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "groq", name: "Groq Cloud", url: "https://api.groq.com/openai/v1/chat/completions", signupUrl: "https://console.groq.com/keys", freeModels: "llama-3.3-70b-versatile", icon: "⚡" },
  { id: "openrouter", name: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", signupUrl: "https://openrouter.ai/keys", freeModels: "mistralai/mistral-small-3.2-24b-instruct:free", icon: "🌐" },
  { id: "together", name: "Together AI", url: "https://api.together.xyz/v1/chat/completions", signupUrl: "https://api.together.ai/settings/api-keys", freeModels: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", icon: "🤝" },
  { id: "cerebras", name: "Cerebras", url: "https://api.cerebras.ai/v1/chat/completions", signupUrl: "https://cloud.cerebras.ai/", freeModels: "llama-3.3-70b", icon: "🧠" },
  { id: "deepinfra", name: "DeepInfra", url: "https://api.deepinfra.com/v1/openai/chat/completions", signupUrl: "https://deepinfra.com/dash/api_keys", freeModels: "meta-llama/Llama-3.3-70B-Instruct", icon: "🔥" },
  { id: "sambanova", name: "SambaNova", url: "https://api.sambanova.ai/v1/chat/completions", signupUrl: "https://cloud.sambanova.ai/apis", freeModels: "Meta-Llama-3.3-70B-Instruct", icon: "🚀" },
  { id: "mistral", name: "Mistral AI", url: "https://api.mistral.ai/v1/chat/completions", signupUrl: "https://console.mistral.ai/api-keys/", freeModels: "mistral-small-latest", icon: "💨" },
  { id: "deepseek", name: "DeepSeek", url: "https://api.deepseek.com/v1/chat/completions", signupUrl: "https://platform.deepseek.com/api_keys", freeModels: "deepseek-chat", icon: "🔍" },
];

export interface StoredApiKey {
  providerId: string;
  apiKey: string;
  lastTested?: string;
  status?: "ok" | "error" | "untested";
}

const STORAGE_KEY = "contactunifier_api_keys";

export function loadApiKeys(): StoredApiKey[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

export function saveApiKeys(keys: StoredApiKey[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function getActiveKeys(): Record<string, string> {
  const keys = loadApiKeys();
  const result: Record<string, string> = {};
  for (const k of keys) {
    if (k.apiKey && k.status !== "error") result[k.providerId] = k.apiKey;
  }
  return result;
}

export function ApiKeysPanel() {
  const [keys, setKeys] = useState<StoredApiKey[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  useEffect(() => { setKeys(loadApiKeys()); }, []);

  const updateKey = (providerId: string, apiKey: string) => {
    setKeys(prev => {
      const existing = prev.find(k => k.providerId === providerId);
      const updated = existing
        ? prev.map(k => k.providerId === providerId ? { ...k, apiKey, status: "untested" as const } : k)
        : [...prev, { providerId, apiKey, status: "untested" as const }];
      saveApiKeys(updated);
      return updated;
    });
  };

  const removeKey = (providerId: string) => {
    setKeys(prev => {
      const updated = prev.filter(k => k.providerId !== providerId);
      saveApiKeys(updated);
      return updated;
    });
  };

  const testKey = async (provider: ProviderInfo) => {
    const stored = keys.find(k => k.providerId === provider.id);
    if (!stored?.apiKey) { toast.error("Ingresá una API key primero"); return; }

    setTesting(provider.id);
    try {
      const { data, error } = await supabase.functions.invoke("clean-contacts", {
        body: {
          contacts: [{ firstName: "Test", lastName: "User", email: "test@test.com" }],
          provider: provider.id,
          customKeys: { [provider.id]: stored.apiKey },
        },
      });

      if (error || data?.error) {
        throw new Error(error?.message || data?.error);
      }

      setKeys(prev => {
        const updated = prev.map(k => k.providerId === provider.id
          ? { ...k, status: "ok" as const, lastTested: new Date().toLocaleString() }
          : k);
        saveApiKeys(updated);
        return updated;
      });
      toast.success(`✅ ${provider.name}: API key funciona correctamente`);
    } catch (err: any) {
      setKeys(prev => {
        const updated = prev.map(k => k.providerId === provider.id
          ? { ...k, status: "error" as const, lastTested: new Date().toLocaleString() }
          : k);
        saveApiKeys(updated);
        return updated;
      });
      toast.error(`❌ ${provider.name}: ${err.message || "Error de conexión"}`);
    } finally {
      setTesting(null);
    }
  };

  const getKeyValue = (providerId: string) => keys.find(k => k.providerId === providerId)?.apiKey || "";
  const getStatus = (providerId: string) => keys.find(k => k.providerId === providerId)?.status;
  const getLastTested = (providerId: string) => keys.find(k => k.providerId === providerId)?.lastTested;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" />
          API Keys — Proveedores de IA
          <Badge variant="outline" className="text-[10px]">Rotación automática</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Agregá tus propias API keys. Cuando una se agota, el sistema rota a la siguiente disponible.
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3">
            {PROVIDERS.map(provider => {
              const status = getStatus(provider.id);
              const isTesting = testing === provider.id;
              return (
                <div key={provider.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{provider.icon}</span>
                      <span className="text-xs font-medium">{provider.name}</span>
                      {status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                      {status === "error" && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                    </div>
                    <a href={provider.signupUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-primary hover:underline flex items-center gap-1">
                      Obtener key <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Modelo: {provider.freeModels}
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showKey[provider.id] ? "text" : "password"}
                        placeholder="sk-..."
                        value={getKeyValue(provider.id)}
                        onChange={e => updateKey(provider.id, e.target.value)}
                        className="h-8 text-xs pr-8 font-mono"
                      />
                      <button
                        onClick={() => setShowKey(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey[provider.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                      disabled={isTesting || !getKeyValue(provider.id)}
                      onClick={() => testKey(provider)}>
                      {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}
                      Test
                    </Button>
                    {getKeyValue(provider.id) && (
                      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => removeKey(provider.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                  {getLastTested(provider.id) && (
                    <p className="text-[10px] text-muted-foreground">
                      Último test: {getLastTested(provider.id)} — {status === "ok" ? "✅ OK" : "❌ Error"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
