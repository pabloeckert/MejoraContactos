import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = [
  "https://util.mejoraok.com",
  "https://mejoraok.com",
  "http://localhost:8080",
  "http://localhost:5173",
];

// --- Rate limiting ---
// Sliding window: max RATE_LIMIT_MAX requests per RATE_LIMIT_WINDOW_MS per IP
const RATE_LIMIT_MAX = 30; // max requests per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute window

const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = rateLimitMap.get(ip) || [];

  // Prune old entries
  const recent = timestamps.filter((t) => t > windowStart);
  rateLimitMap.set(ip, recent);

  if (recent.length >= RATE_LIMIT_MAX) {
    const oldestInWindow = recent[0];
    const retryAfter = Math.ceil((oldestInWindow + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter };
  }

  recent.push(now);
  return { allowed: true };
}

// Periodic cleanup to prevent memory leak (runs every 5 min via request pattern)
let lastCleanup = 0;
function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  const cutoff = now - RATE_LIMIT_WINDOW_MS * 2;
  for (const [ip, timestamps] of rateLimitMap) {
    const recent = timestamps.filter((t) => t > cutoff);
    if (recent.length === 0) rateLimitMap.delete(ip);
    else rateLimitMap.set(ip, recent);
  }
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

interface RawContact {
  firstName?: string;
  lastName?: string;
  whatsapp?: string;
  company?: string;
  jobTitle?: string;
  email?: string;
}

type Provider =
  | "lovable" | "groq" | "openrouter" | "together" | "cerebras"
  | "deepinfra" | "sambanova" | "mistral" | "deepseek"
  | "gemini" | "cloudflare" | "huggingface" | "nebius"
  | "pipeline";

interface ProviderConfig {
  url: string;
  apiKey: string;
  model: string;
  name: string;
  extraHeaders?: Record<string, string>;
}

// customKeys can be string (single) OR string[] (multiple keys per provider for rotation)
type CustomKeysInput = Record<string, string | string[]>;

function getKeysForProvider(provider: string, customKeys?: CustomKeysInput): string[] {
  const v = customKeys?.[provider];
  if (!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v].filter(Boolean);
}

function buildConfig(provider: Exclude<Provider, "pipeline">, apiKey: string): ProviderConfig {
  switch (provider) {
    case "groq":
      return { url: "https://api.groq.com/openai/v1/chat/completions", apiKey, model: "llama-3.3-70b-versatile", name: "Groq (Llama 3.3 70B)" };
    case "openrouter":
      return { url: "https://openrouter.ai/api/v1/chat/completions", apiKey, model: "mistralai/mistral-small-3.2-24b-instruct:free", name: "OpenRouter (Mistral Small Free)", extraHeaders: { "HTTP-Referer": "https://lovable.dev" } };
    case "together":
      return { url: "https://api.together.xyz/v1/chat/completions", apiKey, model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", name: "Together AI (Llama 3.3)" };
    case "cerebras":
      return { url: "https://api.cerebras.ai/v1/chat/completions", apiKey, model: "llama-3.3-70b", name: "Cerebras (Llama 3.3)" };
    case "deepinfra":
      return { url: "https://api.deepinfra.com/v1/openai/chat/completions", apiKey, model: "meta-llama/Llama-3.3-70B-Instruct", name: "DeepInfra (Llama 3.3)" };
    case "sambanova":
      return { url: "https://api.sambanova.ai/v1/chat/completions", apiKey, model: "Meta-Llama-3.3-70B-Instruct", name: "SambaNova (Llama 3.3)" };
    case "mistral":
      return { url: "https://api.mistral.ai/v1/chat/completions", apiKey, model: "mistral-small-latest", name: "Mistral AI (Small)" };
    case "deepseek":
      return { url: "https://api.deepseek.com/v1/chat/completions", apiKey, model: "deepseek-chat", name: "DeepSeek Chat" };
    case "gemini":
      return { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", apiKey, model: "gemini-2.0-flash-exp", name: "Google Gemini Flash" };
    case "cloudflare": {
      // Format expected: TOKEN:ACCOUNT_ID
      const [token, accountId] = apiKey.split(":");
      if (!accountId) throw new Error("Cloudflare requiere formato TOKEN:ACCOUNT_ID");
      return {
        url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
        apiKey: token, model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", name: "Cloudflare Workers AI",
      };
    }
    case "huggingface":
      return { url: "https://api-inference.huggingface.co/v1/chat/completions", apiKey, model: "meta-llama/Llama-3.3-70B-Instruct", name: "Hugging Face (Llama 3.3)" };
    case "nebius":
      return { url: "https://api.studio.nebius.ai/v1/chat/completions", apiKey, model: "meta-llama/Llama-3.3-70B-Instruct", name: "Nebius AI (Llama 3.3)" };
    default: {
      return { url: "https://ai.gateway.lovable.dev/v1/chat/completions", apiKey, model: "google/gemini-3-flash-preview", name: "Lovable AI (Gemini Flash)" };
    }
  }
}

function getEnvKey(provider: string): string | undefined {
  const map: Record<string, string> = {
    groq: "GROQ_API_KEY", openrouter: "OPENROUTER_API_KEY",
    lovable: "LOVABLE_API_KEY",
  };
  return map[provider] ? Deno.env.get(map[provider]) : undefined;
}

const SYSTEM_CLEAN = "Sos un limpiador de datos. Responde SOLO con JSON valido, sin markdown, sin explicaciones.";
const SYSTEM_VERIFY = "Sos un verificador de datos. Revisas contactos limpiados por otra IA y detectas errores. Responde SOLO con JSON valido, sin markdown.";
const SYSTEM_CORRECT = "Sos un corrector final de datos. Recibes contactos con posibles errores marcados y los corriges. Responde SOLO con JSON valido, sin markdown.";

function buildCleanPrompt(batch: RawContact[]): string {
  return `Sos un asistente experto en limpieza de datos de contactos.
Recibis un array JSON de contactos desordenados. Tu tarea:

1. **Nombre**: Capitalizar correctamente. Si hay nombre completo en un solo campo, separar en firstName y lastName.
2. **Apellido**: Capitalizar correctamente.
3. **WhatsApp**: Formato internacional sin espacios ni guiones, solo numeros con codigo de pais. Sin codigo, asumir +54 (Argentina). Eliminar el 15 si es celular argentino.
4. **Empresa**: Limpiar y capitalizar. Quitar basura como "N/A", "-", ".", etc.
5. **Cargo**: Limpiar y capitalizar. Quitar basura.
6. **Email**: Limpiar, minusculas, validar formato basico. Si es invalido, dejar vacio.

IMPORTANTE:
- Si un campo tiene basura irreconocible, dejarlo vacio "".
- NO inventar datos.
- Devuelve SOLO el array JSON limpio.

Contactos a limpiar:
${JSON.stringify(batch)}`;
}

function buildVerifyPrompt(original: RawContact[], cleaned: RawContact[]): string {
  return `Recibes dos arrays: los datos ORIGINALES y los datos LIMPIADOS por otra IA.
Tu tarea es verificar que la limpieza fue correcta.

Para cada contacto, agrega un campo "issues" (array de strings) con los problemas encontrados.
Si no hay problemas, "issues" debe ser un array vacio [].

Devuelve SOLO el array JSON con el campo "issues" agregado.

ORIGINALES:
${JSON.stringify(original)}

LIMPIADOS:
${JSON.stringify(cleaned)}`;
}

function buildCorrectPrompt(verified: (RawContact & { issues?: string[] })[]): string {
  return `Recibes contactos verificados con posibles "issues" detectadas por otra IA.
Tu tarea es hacer la correccion final. Devuelve SOLO el array JSON final limpio (sin campo "issues").

Contactos a corregir:
${JSON.stringify(verified)}`;
}

async function callAI(config: ProviderConfig, systemPrompt: string, userPrompt: string): Promise<RawContact[]> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(config.extraHeaders || {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 429) throw new Error(`RATE_LIMIT:${config.name} agotó su límite. Rotando...`);
    if (response.status === 402) throw new Error(`CREDITS_EXHAUSTED:${config.name} sin créditos.`);
    if (response.status === 401 || response.status === 403) throw new Error(`AUTH_FAIL:${config.name} key inválida.`);
    throw new Error(`${config.name} error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`${config.name}: no JSON array in response`);
  return JSON.parse(jsonMatch[0]);
}

/**
 * Try every key of every provider with rotation on 429/402/401.
 * Order: primary provider's keys first, then fallback providers' keys.
 */
async function callAIWithFallback(
  primaryProvider: Exclude<Provider, "pipeline">,
  systemPrompt: string,
  userPrompt: string,
  customKeys?: CustomKeysInput
): Promise<{ contacts: RawContact[]; usedProvider: string }> {
  const allProviders: Exclude<Provider, "pipeline">[] = [
    "groq", "openrouter", "gemini", "cerebras", "together",
    "deepinfra", "sambanova", "mistral", "deepseek",
    "cloudflare", "huggingface", "nebius", "lovable",
  ];

  const order: Exclude<Provider, "pipeline">[] = [primaryProvider];
  for (const p of allProviders) if (!order.includes(p)) order.push(p);

  const errors: string[] = [];

  for (const provider of order) {
    // Get all keys: customKeys first, then env fallback
    const keys = getKeysForProvider(provider, customKeys);
    const envKey = getEnvKey(provider);
    if (envKey && !keys.includes(envKey)) keys.push(envKey);

    if (keys.length === 0) continue;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      try {
        const config = buildConfig(provider, key);
        const contacts = await callAI(config, systemPrompt, userPrompt);
        const label = keys.length > 1 ? ` [key ${i + 1}/${keys.length}]` : "";
        return { contacts, usedProvider: `${config.name}${label}` };
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`${provider}#${i + 1}: ${msg.slice(0, 100)}`);
        if (msg.includes("RATE_LIMIT") || msg.includes("CREDITS_EXHAUSTED") || msg.includes("AUTH_FAIL")) {
          console.log(`${provider} key ${i + 1} exhausted/invalid, trying next key/provider...`);
          continue;
        }
        // Other error → still try next
        continue;
      }
    }
  }

  throw new Error(`Todos los proveedores y keys fallaron. Detalles: ${errors.slice(0, 3).join(" | ")}`);
}

interface PipelineStages {
  clean?: string;
  verify?: string;
  correct?: string;
}

async function pipelineBatch(batch: RawContact[], customKeys?: CustomKeysInput, stages?: PipelineStages): Promise<{ contacts: RawContact[]; stages: string[] }> {
  const log: string[] = [];
  const cleanProvider = (stages?.clean || "groq") as Exclude<Provider, "pipeline">;
  const verifyProvider = (stages?.verify || "openrouter") as Exclude<Provider, "pipeline">;
  const correctProvider = (stages?.correct || "lovable") as Exclude<Provider, "pipeline">;

  let cleaned: RawContact[];
  try {
    const result = await callAIWithFallback(cleanProvider, SYSTEM_CLEAN, buildCleanPrompt(batch), customKeys);
    cleaned = result.contacts;
    log.push(`Limpieza: ${result.usedProvider} OK`);
  } catch (e) {
    cleaned = batch;
    log.push(`Limpieza: FALLO - ${(e as Error).message}`);
  }

  let verified: (RawContact & { issues?: string[] })[];
  try {
    const result = await callAIWithFallback(verifyProvider, SYSTEM_VERIFY, buildVerifyPrompt(batch, cleaned), customKeys);
    verified = result.contacts as any;
    const issueCount = verified.reduce((acc, v) => acc + (v.issues?.length || 0), 0);
    log.push(`Verificacion: ${result.usedProvider} OK (${issueCount} issues)`);
  } catch (e) {
    verified = cleaned.map(c => ({ ...c, issues: [] }));
    log.push(`Verificacion: FALLO - ${(e as Error).message}`);
  }

  const hasIssues = verified.some(v => v.issues && v.issues.length > 0);
  let corrected: RawContact[];

  if (hasIssues) {
    try {
      const result = await callAIWithFallback(correctProvider, SYSTEM_CORRECT, buildCorrectPrompt(verified), customKeys);
      corrected = result.contacts;
      log.push(`Correccion: ${result.usedProvider} OK`);
    } catch (e) {
      corrected = cleaned;
      log.push(`Correccion: FALLO - ${(e as Error).message}`);
    }
  } else {
    corrected = cleaned;
    log.push(`Correccion: Sin issues, paso omitido`);
  }

  return { contacts: corrected, stages: log };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Rate limiting by IP
  maybeCleanup();
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: `Rate limit excedido. Máximo ${RATE_LIMIT_MAX} requests por minuto. Reintentá en ${rateLimit.retryAfter}s.`,
        retryAfter: rateLimit.retryAfter,
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(rateLimit.retryAfter),
        },
      }
    );
  }

  try {
    const { contacts, provider: providerParam, customKeys, pipelineStages } = await req.json() as {
      contacts: RawContact[];
      provider?: Provider;
      customKeys?: CustomKeysInput;
      pipelineStages?: PipelineStages;
    };

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return new Response(JSON.stringify({ error: "No contacts provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provider = providerParam || "lovable";

    if (provider === "pipeline") {
      const batchSize = 20;
      const allCleaned: RawContact[] = [];
      const allStages: string[] = [];

      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);
        const result = await pipelineBatch(batch, customKeys, pipelineStages);
        allCleaned.push(...result.contacts);
        if (i === 0) allStages.push(...result.stages);
      }

      const stageNames = [
        pipelineStages?.clean || "groq",
        pipelineStages?.verify || "openrouter",
        pipelineStages?.correct || "lovable",
      ];
      return new Response(JSON.stringify({
        contacts: allCleaned, provider: `Pipeline (${stageNames.join(" → ")})`, stages: allStages,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const batchSize = 25;
    const allCleaned: RawContact[] = [];
    let usedProvider = "";

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      try {
        const result = await callAIWithFallback(provider as Exclude<Provider, "pipeline">, SYSTEM_CLEAN, buildCleanPrompt(batch), customKeys);
        allCleaned.push(...result.contacts);
        usedProvider = result.usedProvider;
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("Todos los proveedores")) {
          return new Response(
            JSON.stringify({ error: msg, exhausted: true }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        allCleaned.push(...batch);
      }
    }

    return new Response(JSON.stringify({ contacts: allCleaned, provider: usedProvider }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("clean-contacts error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
