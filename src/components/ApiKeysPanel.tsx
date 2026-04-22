import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Key, TestTube, CheckCircle2, XCircle, Loader2, ExternalLink, Trash2, Eye, EyeOff,
  Plus, ChevronDown, ChevronRight, RotateCw,
} from "lucide-react";

export interface ProviderInfo {
  id: string;
  name: string;
  url: string;
  signupUrl: string;
  freeModels: string;
  icon: string;
  notes?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "groq", name: "Groq Cloud", url: "https://api.groq.com/openai/v1/chat/completions", signupUrl: "https://console.groq.com/keys", freeModels: "llama-3.3-70b-versatile", icon: "⚡", notes: "Free tier muy generoso, ultra rápido" },
  { id: "openrouter", name: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", signupUrl: "https://openrouter.ai/keys", freeModels: "mistralai/mistral-small-3.2-24b-instruct:free", icon: "🌐", notes: "Acceso a múltiples modelos free" },
  { id: "together", name: "Together AI", url: "https://api.together.xyz/v1/chat/completions", signupUrl: "https://api.together.ai/settings/api-keys", freeModels: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", icon: "🤝", notes: "Llama 3.3 70B gratis" },
  { id: "cerebras", name: "Cerebras", url: "https://api.cerebras.ai/v1/chat/completions", signupUrl: "https://cloud.cerebras.ai/", freeModels: "llama-3.3-70b", icon: "🧠", notes: "El más rápido del mercado" },
  { id: "deepinfra", name: "DeepInfra", url: "https://api.deepinfra.com/v1/openai/chat/completions", signupUrl: "https://deepinfra.com/dash/api_keys", freeModels: "meta-llama/Llama-3.3-70B-Instruct", icon: "🔥", notes: "Pay-per-token económico" },
  { id: "sambanova", name: "SambaNova", url: "https://api.sambanova.ai/v1/chat/completions", signupUrl: "https://cloud.sambanova.ai/apis", freeModels: "Meta-Llama-3.3-70B-Instruct", icon: "🚀", notes: "Free tier diario" },
  { id: "mistral", name: "Mistral AI", url: "https://api.mistral.ai/v1/chat/completions", signupUrl: "https://console.mistral.ai/api-keys/", freeModels: "mistral-small-latest", icon: "💨", notes: "Modelos europeos" },
  { id: "deepseek", name: "DeepSeek", url: "https://api.deepseek.com/v1/chat/completions", signupUrl: "https://platform.deepseek.com/api_keys", freeModels: "deepseek-chat", icon: "🔍", notes: "Muy económico" },
  { id: "gemini", name: "Google AI Studio (Gemini)", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", signupUrl: "https://aistudio.google.com/app/apikey", freeModels: "gemini-2.0-flash-exp", icon: "✨", notes: "Free tier muy generoso de Google" },
  { id: "cloudflare", name: "Cloudflare Workers AI", url: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions", signupUrl: "https://dash.cloudflare.com/profile/api-tokens", freeModels: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", icon: "☁️", notes: "Requiere también Account ID (formato: TOKEN:ACCOUNT_ID)" },
  { id: "huggingface", name: "Hugging Face Inference", url: "https://api-inference.huggingface.co/v1/chat/completions", signupUrl: "https://huggingface.co/settings/tokens", freeModels: "meta-llama/Llama-3.3-70B-Instruct", icon: "🤗", notes: "Miles de modelos open source" },
  { id: "nebius", name: "Nebius AI", url: "https://api.studio.nebius.ai/v1/chat/completions", signupUrl: "https://studio.nebius.ai/settings/api-keys", freeModels: "meta-llama/Llama-3.3-70B-Instruct", icon: "🌌", notes: "Free credits iniciales" },
];

export interface KeyEntry {
  id: string;
  apiKey: string;
  label?: string;
  lastTested?: string;
  status?: "ok" | "error" | "untested";
}

export interface ProviderKeys {
  providerId: string;
  keys: KeyEntry[];
}

const STORAGE_KEY = "mejoraapp_api_keys_v2";
const LEGACY_KEY = "contactunifier_api_keys";

export function loadProviderKeys(): ProviderKeys[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProviderKeys[];
    // Migration from v1
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as Array<{ providerId: string; apiKey: string; status?: string; lastTested?: string }>;
      const migrated: ProviderKeys[] = old.map(o => ({
        providerId: o.providerId,
        keys: [{ id: crypto.randomUUID(), apiKey: o.apiKey, status: (o.status as KeyEntry["status"]) || "untested", lastTested: o.lastTested }],
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return [];
  } catch { return []; }
}

export function saveProviderKeys(keys: ProviderKeys[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

/**
 * Returns active keys grouped per provider (array of keys for rotation).
 * Backward-compatible: also flattens to first key for legacy single-key consumers.
 */
export function getActiveKeysMulti(): Record<string, string[]> {
  const all = loadProviderKeys();
  const result: Record<string, string[]> = {};
  for (const pk of all) {
    const valid = pk.keys.filter(k => k.apiKey && k.status !== "error").map(k => k.apiKey);
    if (valid.length > 0) result[pk.providerId] = valid;
  }
  return result;
}

/** Legacy single-key API kept for compatibility */
export function getActiveKeys(): Record<string, string> {
  const multi = getActiveKeysMulti();
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(multi)) flat[k] = v[0];
  return flat;
}

export function ApiKeysPanel() {
  const [providers, setProviders] = useState<ProviderKeys[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [openProviders, setOpenProviders] = useState<Record<string, boolean>>({});

  useEffect(() => { setProviders(loadProviderKeys()); }, []);

  const getProviderKeys = (providerId: string): KeyEntry[] => {
    return providers.find(p => p.providerId === providerId)?.keys || [];
  };

  const updateProviders = (updater: (prev: ProviderKeys[]) => ProviderKeys[]) => {
    setProviders(prev => {
      const next = updater(prev);
      saveProviderKeys(next);
      return next;
    });
  };

  const addKey = (providerId: string) => {
    updateProviders(prev => {
      const existing = prev.find(p => p.providerId === providerId);
      const newKey: KeyEntry = { id: crypto.randomUUID(), apiKey: "", status: "untested" };
      if (existing) {
        return prev.map(p => p.providerId === providerId ? { ...p, keys: [...p.keys, newKey] } : p);
      }
      return [...prev, { providerId, keys: [newKey] }];
    });
    setOpenProviders(prev => ({ ...prev, [providerId]: true }));
  };

  const updateKey = (providerId: string, keyId: string, apiKey: string) => {
    updateProviders(prev => prev.map(p =>
      p.providerId === providerId
        ? { ...p, keys: p.keys.map(k => k.id === keyId ? { ...k, apiKey, status: "untested" } : k) }
        : p
    ));
  };

  const updateLabel = (providerId: string, keyId: string, label: string) => {
    updateProviders(prev => prev.map(p =>
      p.providerId === providerId
        ? { ...p, keys: p.keys.map(k => k.id === keyId ? { ...k, label } : k) }
        : p
    ));
  };

  const removeKey = (providerId: string, keyId: string) => {
    updateProviders(prev => prev.map(p =>
      p.providerId === providerId
        ? { ...p, keys: p.keys.filter(k => k.id !== keyId) }
        : p
    ).filter(p => p.keys.length > 0));
  };

  const testKey = async (provider: ProviderInfo, keyId: string) => {
    const pk = providers.find(p => p.providerId === provider.id);
    const key = pk?.keys.find(k => k.id === keyId);
    if (!key?.apiKey) { toast.error("Ingresá una API key primero"); return; }

    setTesting(keyId);
    try {
      const { data, error } = await supabase.functions.invoke("clean-contacts", {
        body: {
          contacts: [{ firstName: "Test", lastName: "User", email: "test@test.com" }],
          provider: provider.id,
          customKeys: { [provider.id]: key.apiKey },
        },
      });

      if (error || data?.error) {
        throw new Error(error?.message || data?.error);
      }

      updateProviders(prev => prev.map(p =>
        p.providerId === provider.id
          ? { ...p, keys: p.keys.map(k => k.id === keyId
              ? { ...k, status: "ok", lastTested: new Date().toLocaleString() }
              : k) }
          : p
      ));
      toast.success(`✅ ${provider.name} (${key.label || "key"}): funcionando correctamente`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error de conexión";
      updateProviders(prev => prev.map(p =>
        p.providerId === provider.id
          ? { ...p, keys: p.keys.map(k => k.id === keyId
              ? { ...k, status: "error", lastTested: new Date().toLocaleString() }
              : k) }
          : p
      ));
      toast.error(`❌ ${provider.name}: ${message}`);
    } finally {
      setTesting(null);
    }
  };

  const testAll = async () => {
    let okCount = 0, errCount = 0;
    for (const pk of providers) {
      const provider = PROVIDERS.find(p => p.id === pk.providerId);
      if (!provider) continue;
      for (const k of pk.keys) {
        if (!k.apiKey) continue;
        await testKey(provider, k.id);
        // give UI a tick
        await new Promise(r => setTimeout(r, 200));
        const updated = loadProviderKeys().find(p => p.providerId === pk.providerId)?.keys.find(x => x.id === k.id);
        if (updated?.status === "ok") okCount++; else errCount++;
      }
    }
    toast.info(`Test masivo: ${okCount} OK, ${errCount} con error`);
  };

  const totalKeys = providers.reduce((acc, p) => acc + p.keys.length, 0);
  const okKeys = providers.reduce((acc, p) => acc + p.keys.filter(k => k.status === "ok").length, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              Administrador de API Keys
              <Badge variant="outline" className="text-[10px]">Rotación automática</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Cargá <strong>varias keys por proveedor</strong>. Cuando una se agota o falla, MejoraContactos rota automáticamente a la siguiente.
            </p>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary" className="text-[10px]">{totalKeys} keys totales</Badge>
              <Badge className="text-[10px] bg-green-500/15 text-green-600 border-green-500/30">{okKeys} verificadas OK</Badge>
            </div>
          </div>
          {totalKeys > 0 && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={testAll}>
              <RotateCw className="h-3 w-3" />
              Test todas
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[600px] pr-2">
          <div className="space-y-2">
            {PROVIDERS.map(provider => {
              const pkeys = getProviderKeys(provider.id);
              const isOpen = openProviders[provider.id] ?? pkeys.length > 0;
              const okCount = pkeys.filter(k => k.status === "ok").length;
              const errCount = pkeys.filter(k => k.status === "error").length;

              return (
                <Collapsible
                  key={provider.id}
                  open={isOpen}
                  onOpenChange={(o) => setOpenProviders(prev => ({ ...prev, [provider.id]: o }))}
                  className="rounded-lg border"
                >
                  <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2 text-left">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="text-base">{provider.icon}</span>
                      <div>
                        <p className="text-xs font-semibold">{provider.name}</p>
                        <p className="text-[10px] text-muted-foreground">{provider.notes}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {pkeys.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">{pkeys.length} {pkeys.length === 1 ? "key" : "keys"}</Badge>
                      )}
                      {okCount > 0 && <Badge className="text-[10px] bg-green-500/15 text-green-600 border-green-500/30">{okCount} OK</Badge>}
                      {errCount > 0 && <Badge className="text-[10px] bg-red-500/15 text-red-600 border-red-500/30">{errCount} ERR</Badge>}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3 space-y-2 border-t bg-muted/10">
                      <div className="flex items-center justify-between pt-2">
                        <a href={provider.signupUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-primary hover:underline flex items-center gap-1">
                          Obtener API key <ExternalLink className="h-3 w-3" />
                        </a>
                        <p className="text-[10px] text-muted-foreground font-mono">Modelo: {provider.freeModels}</p>
                      </div>

                      {pkeys.map((k, idx) => {
                        const showId = `${provider.id}-${k.id}`;
                        const isTesting = testing === k.id;
                        return (
                          <div key={k.id} className="rounded-md border bg-card p-2 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] shrink-0">#{idx + 1}</Badge>
                              <Input
                                placeholder="Etiqueta opcional (ej: Cuenta personal)"
                                value={k.label || ""}
                                onChange={e => updateLabel(provider.id, k.id, e.target.value)}
                                className="h-7 text-[11px] flex-1"
                              />
                              {k.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                              {k.status === "error" && <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                            </div>
                            <div className="flex gap-1.5">
                              <div className="relative flex-1">
                                <Input
                                  type={showKey[showId] ? "text" : "password"}
                                  placeholder="sk-..."
                                  value={k.apiKey}
                                  onChange={e => updateKey(provider.id, k.id, e.target.value)}
                                  className="h-8 text-xs pr-8 font-mono"
                                />
                                <button
                                  onClick={() => setShowKey(prev => ({ ...prev, [showId]: !prev[showId] }))}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  type="button"
                                >
                                  {showKey[showId] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                              <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                                disabled={isTesting || !k.apiKey}
                                onClick={() => testKey(provider, k.id)}>
                                {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}
                                Test
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => removeKey(provider.id, k.id)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                            {k.lastTested && (
                              <p className="text-[10px] text-muted-foreground">
                                Último test: {k.lastTested} — {k.status === "ok" ? "✅ OK" : k.status === "error" ? "❌ Error" : "⏳ Sin probar"}
                              </p>
                            )}
                          </div>
                        );
                      })}

                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-8 text-xs gap-1 border-dashed"
                        onClick={() => addKey(provider.id)}
                      >
                        <Plus className="h-3 w-3" />
                        Agregar otra key de {provider.name}
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
