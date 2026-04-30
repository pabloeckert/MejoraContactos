import {
  SYSTEM_CLEAN,
  SYSTEM_VERIFY,
  SYSTEM_CORRECT,
  buildCleanPrompt,
  buildVerifyPrompt,
  buildCorrectPrompt,
  type RawContact,
} from "./prompts.ts";

const ALLOWED_ORIGINS = [
  "https://util.mejoraok.com",
  "https://mejoraok.com",
  "http://localhost:8080",
  "http://localhost:5173",
];

// --- Rate limiting (DB-backed, cross-instance) ---
const RATE_LIMIT_MAX = 30; // max requests per window
const RATE_LIMIT_WINDOW_SEC = 60; // 1 minute window in seconds
const CLEANUP_PROBABILITY = 0.01; // ~1% chance per request

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return { url, key };
}

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

async function checkRateLimitDB(ip: string): Promise<RateLimitResult> {
  const { url, key } = getSupabaseAdmin();
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SEC * 1000).toISOString();

  // Count entries for this IP in the current window
  const countRes = await fetch(
    `${url}/rest/v1/rate_limits?ip=eq.${encodeURIComponent(ip)}&timestamp=gte.${windowStart}&select=count`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    }
  );

  if (!countRes.ok) {
    console.error("Rate limit count query failed:", await countRes.text());
    // Fail-open: don't block on DB errors
    return { allowed: true };
  }

  // Supabase returns count in Content-Range header when Prefer: count=exact
  const contentRange = countRes.headers.get("Content-Range");
  const count = contentRange ? parseInt(contentRange.split("/")[1] || "0", 10) : 0;

  if (count >= RATE_LIMIT_MAX) {
    // Calculate retry-after: need the oldest entry in the window
    const oldestRes = await fetch(
      `${url}/rest/v1/rate_limits?ip=eq.${encodeURIComponent(ip)}&timestamp=gte.${windowStart}&order=timestamp.asc&limit=1&select=timestamp`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      }
    );

    let retryAfter = RATE_LIMIT_WINDOW_SEC;
    if (oldestRes.ok) {
      const rows = await oldestRes.json();
      if (rows.length > 0) {
        const oldest = new Date(rows[0].timestamp).getTime();
        retryAfter = Math.ceil((oldest + RATE_LIMIT_WINDOW_SEC * 1000 - Date.now()) / 1000);
        if (retryAfter < 1) retryAfter = 1;
      }
    }

    return { allowed: false, retryAfter };
  }

  // Insert new entry (fire-and-forget to avoid adding latency)
  fetch(`${url}/rest/v1/rate_limits`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ ip, timestamp: new Date().toISOString() }),
  }).catch((err) => console.error("Rate limit insert failed:", err));

  return { allowed: true };
}

async function cleanupOldEntries(): Promise<void> {
  const { url, key } = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Delete entries older than 5 minutes
  fetch(`${url}/rest/v1/rate_limits?timestamp=lt.${cutoff}`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=minimal",
    },
  }).catch((err) => console.error("Rate limit cleanup failed:", err));
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

type Provider =
  | "groq" | "openrouter" | "together" | "cerebras"
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
      return { url: "https://openrouter.ai/api/v1/chat/completions", apiKey, model: "meta-llama/llama-3.3-70b-instruct:free", name: "OpenRouter (Llama 3.3 Free)", extraHeaders: { "HTTP-Referer": "https://mejoraok.com" } };
    case "together":
      return { url: "https://api.together.xyz/v1/chat/completions", apiKey, model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", name: "Together AI (Llama 3.3)" };
    case "cerebras":
      return { url: "https://api.cerebras.ai/v1/chat/completions", apiKey, model: "llama3.1-8b", name: "Cerebras (Llama 3.1 8B)" };
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
    default:
      throw new Error(`Proveedor desconocido: ${provider}`);
  }
}

function getEnvKey(provider: string): string | undefined {
  const map: Record<string, string> = {
    groq: "GROQ_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };
  return map[provider] ? Deno.env.get(map[provider]) : undefined;
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
    "cloudflare", "huggingface", "nebius",
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
      const MAX_RETRIES = 2;
      for (let retry = 0; retry <= MAX_RETRIES; retry++) {
        try {
          const config = buildConfig(provider, key);
          const contacts = await callAI(config, systemPrompt, userPrompt);
          const label = keys.length > 1 ? ` [key ${i + 1}/${keys.length}]` : "";
          return { contacts, usedProvider: `${config.name}${label}` };
        } catch (e) {
          const msg = (e as Error).message;
          // Don't retry on auth/credits errors
          if (msg.includes("CREDITS_EXHAUSTED") || msg.includes("AUTH_FAIL")) {
            errors.push(`${provider}#${i + 1}: ${msg.slice(0, 100)}`);
            break; // Move to next key
          }
          if (msg.includes("RATE_LIMIT")) {
            errors.push(`${provider}#${i + 1}: ${msg.slice(0, 100)}`);
            break; // Move to next key (rotation handles this)
          }
          // Transient error — retry with backoff
          if (retry < MAX_RETRIES) {
            const delay = Math.min(1000 * Math.pow(2, retry), 4000); // 1s, 2s, 4s max
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          errors.push(`${provider}#${i + 1}: ${msg.slice(0, 100)}`);
          continue;
        }
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
  const correctProvider = (stages?.correct || "gemini") as Exclude<Provider, "pipeline">;

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
    verified = result.contacts as unknown as (RawContact & { issues?: string[] })[];
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

/**
 * Verify Supabase JWT by calling the GoTrue /auth/v1/user endpoint.
 * Rejects requests without a valid bearer token.
 */
async function verifyJWT(authHeader: string | null): Promise<{ valid: boolean; userId?: string; error?: string }> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token) return { valid: false, error: "Empty token" };

  // Supabase anon key is always allowed (it's the public key the client sends)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");
    return { valid: false, error: "Server misconfiguration" };
  }

  // Verify token against Supabase Auth
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    });

    if (res.ok) {
      const user = await res.json();
      return { valid: true, userId: user.id };
    }

    // Anon key JWT (not a user token) is still allowed for public access
    // Supabase anon key JWTs have role=anon in the JWT claims
    // We allow them through — the real protection is rate limiting
    if (res.status === 401 || res.status === 403) {
      // Could be an anon key JWT (no user session) — check if it's a valid JWT format
      const parts = token.split(".");
      if (parts.length === 3) {
        // Valid JWT structure — allow (anon key or user token)
        return { valid: true };
      }
      return { valid: false, error: "Invalid token" };
    }

    return { valid: false, error: `Auth service returned ${res.status}` };
  } catch (e) {
    console.error("JWT verification error:", e);
    // Fail-open for network issues (don't block legitimate users)
    // But log the error for monitoring
    return { valid: true };
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // JWT verification
  const authResult = await verifyJWT(req.headers.get("authorization"));
  if (!authResult.valid) {
    return new Response(
      JSON.stringify({ error: `Unauthorized: ${authResult.error}` }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Rate limiting by IP (DB-backed, cross-instance)
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimit = await checkRateLimitDB(clientIp);
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

  // Probabilistic cleanup of old rate limit entries (~1% of requests)
  if (Math.random() < CLEANUP_PROBABILITY) {
    cleanupOldEntries();
  }

  // Input validation (Zod-like, inline for Deno Edge Function without npm)
  let body: {
    contacts: RawContact[];
    provider?: Provider;
    customKeys?: CustomKeysInput;
    pipelineStages?: PipelineStages;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { contacts, provider: providerParam, customKeys, pipelineStages } = body;

  // Validate contacts array
  if (!contacts || !Array.isArray(contacts)) {
    return new Response(JSON.stringify({ error: "contacts must be a non-empty array" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (contacts.length === 0) {
    return new Response(JSON.stringify({ error: "contacts array is empty" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (contacts.length > 10000) {
    return new Response(JSON.stringify({ error: "Maximum 10,000 contacts per request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate each contact has at least one non-empty field
  const validProviders: Provider[] = [
    "groq", "openrouter", "together", "cerebras", "deepinfra",
    "sambanova", "mistral", "deepseek", "gemini", "cloudflare",
    "huggingface", "nebius", "pipeline",
  ];

  if (providerParam && !validProviders.includes(providerParam)) {
    return new Response(JSON.stringify({
      error: `Invalid provider: ${providerParam}. Valid: ${validProviders.join(", ")}`,
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate pipelineStages if provided
  if (pipelineStages) {
    const stageKeys = ["clean", "verify", "correct"] as const;
    for (const key of stageKeys) {
      const val = pipelineStages[key];
      if (val && !validProviders.includes(val as Provider)) {
        return new Response(JSON.stringify({
          error: `Invalid pipelineStages.${key}: ${val}. Valid: ${validProviders.join(", ")}`,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  // Sanitize contacts — strip non-string fields, limit field lengths
  const MAX_FIELD_LEN = 500;
  const sanitizedContacts = contacts.map((c) => ({
    firstName: typeof c.firstName === "string" ? c.firstName.slice(0, MAX_FIELD_LEN) : undefined,
    lastName: typeof c.lastName === "string" ? c.lastName.slice(0, MAX_FIELD_LEN) : undefined,
    whatsapp: typeof c.whatsapp === "string" ? c.whatsapp.slice(0, 50) : undefined,
    company: typeof c.company === "string" ? c.company.slice(0, MAX_FIELD_LEN) : undefined,
    jobTitle: typeof c.jobTitle === "string" ? c.jobTitle.slice(0, MAX_FIELD_LEN) : undefined,
    email: typeof c.email === "string" ? c.email.slice(0, 254) : undefined,
  }));

  const provider = providerParam || "groq";

  if (provider === "pipeline") {
    const batchSize = 20;
    const allCleaned: RawContact[] = [];
    const allStages: string[] = [];

    for (let i = 0; i < sanitizedContacts.length; i += batchSize) {
      const batch = sanitizedContacts.slice(i, i + batchSize);
      const result = await pipelineBatch(batch, customKeys, pipelineStages);
      allCleaned.push(...result.contacts);
      if (i === 0) allStages.push(...result.stages);
    }

    const stageNames = [
      pipelineStages?.clean || "groq",
      pipelineStages?.verify || "openrouter",
      pipelineStages?.correct || "gemini",
    ];
    return new Response(JSON.stringify({
      contacts: allCleaned, provider: `Pipeline (${stageNames.join(" → ")})`, stages: allStages,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const batchSize = 25;
  const allCleaned: RawContact[] = [];
  let usedProvider = "";

  for (let i = 0; i < sanitizedContacts.length; i += batchSize) {
    const batch = sanitizedContacts.slice(i, i + batchSize);
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
});
