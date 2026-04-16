import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RawContact {
  firstName?: string;
  lastName?: string;
  whatsapp?: string;
  company?: string;
  jobTitle?: string;
  email?: string;
}

type Provider = "lovable" | "groq" | "openrouter" | "together" | "cerebras" | "deepinfra" | "sambanova" | "mistral" | "deepseek" | "pipeline";

interface ProviderConfig {
  url: string;
  apiKey: string;
  model: string;
  name: string;
}

function getProviderConfig(provider: Exclude<Provider, "pipeline">, customKeys?: Record<string, string>): ProviderConfig {
  const customKey = customKeys?.[provider];

  switch (provider) {
    case "groq": {
      const key = customKey || Deno.env.get("GROQ_API_KEY");
      if (!key) throw new Error("GROQ_API_KEY no configurada. Agregá tu key en Configuración.");
      return { url: "https://api.groq.com/openai/v1/chat/completions", apiKey: key, model: "llama-3.3-70b-versatile", name: "Groq (Llama 3.3 70B)" };
    }
    case "openrouter": {
      const key = customKey || Deno.env.get("OPENROUTER_API_KEY");
      if (!key) throw new Error("OPENROUTER_API_KEY no configurada");
      return { url: "https://openrouter.ai/api/v1/chat/completions", apiKey: key, model: "mistralai/mistral-small-3.2-24b-instruct:free", name: "OpenRouter (Mistral Small Free)" };
    }
    case "together": {
      const key = customKey;
      if (!key) throw new Error("TOGETHER_API_KEY no configurada. Agregá tu key en Configuración.");
      return { url: "https://api.together.xyz/v1/chat/completions", apiKey: key, model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", name: "Together AI (Llama 3.3)" };
    }
    case "cerebras": {
      const key = customKey;
      if (!key) throw new Error("CEREBRAS_API_KEY no configurada. Agregá tu key en Configuración.");
      return { url: "https://api.cerebras.ai/v1/chat/completions", apiKey: key, model: "llama-3.3-70b", name: "Cerebras (Llama 3.3)" };
    }
    case "deepinfra": {
      const key = customKey;
      if (!key) throw new Error("DEEPINFRA_API_KEY no configurada. Agregá tu key en Configuración.");
      return { url: "https://api.deepinfra.com/v1/openai/chat/completions", apiKey: key, model: "meta-llama/Llama-3.3-70B-Instruct", name: "DeepInfra (Llama 3.3)" };
    }
    case "sambanova": {
      const key = customKey;
      if (!key) throw new Error("SAMBANOVA_API_KEY no configurada. Agregá tu key en Configuración.");
      return { url: "https://api.sambanova.ai/v1/chat/completions", apiKey: key, model: "Meta-Llama-3.3-70B-Instruct", name: "SambaNova (Llama 3.3)" };
    }
    case "mistral": {
      const key = customKey;
      if (!key) throw new Error("MISTRAL_API_KEY no configurada. Agregá tu key en Configuración.");
      return { url: "https://api.mistral.ai/v1/chat/completions", apiKey: key, model: "mistral-small-latest", name: "Mistral AI (Small)" };
    }
    case "deepseek": {
      const key = customKey;
      if (!key) throw new Error("DEEPSEEK_API_KEY no configurada. Agregá tu key en Configuración.");
      return { url: "https://api.deepseek.com/v1/chat/completions", apiKey: key, model: "deepseek-chat", name: "DeepSeek Chat" };
    }
    default: {
      const key = Deno.env.get("LOVABLE_API_KEY");
      if (!key) throw new Error("LOVABLE_API_KEY no configurada");
      return { url: "https://ai.gateway.lovable.dev/v1/chat/completions", apiKey: key, model: "google/gemini-3-flash-preview", name: "Lovable AI (Gemini Flash)" };
    }
  }
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
Tu tarea es verificar que la limpieza fue correcta:

1. Verificar que no se perdio informacion importante
2. Verificar que los telefonos tienen formato correcto (+codigo pais + numero)
3. Verificar que los emails son validos
4. Verificar que los nombres estan bien capitalizados
5. Verificar que no se invento informacion que no existia en el original

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
Tu tarea es hacer la correccion final:

1. Corregir todos los issues marcados
2. Asegurar formato internacional de telefonos (+54 para Argentina si no tiene codigo)
3. Asegurar emails en minusculas y validos
4. Asegurar nombres bien capitalizados
5. Eliminar el campo "issues" del resultado final

Devuelve SOLO el array JSON final limpio y corregido (sin campo "issues").

Contactos a corregir:
${JSON.stringify(verified)}`;
}

async function callAI(config: ProviderConfig, systemPrompt: string, userPrompt: string, provider: string): Promise<RawContact[]> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(provider === "openrouter" ? { "HTTP-Referer": "https://lovable.dev" } : {}),
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
    if (response.status === 429) {
      throw new Error(`RATE_LIMIT:${config.name} agotó su límite. Rotando...`);
    }
    if (response.status === 402) {
      throw new Error(`CREDITS_EXHAUSTED:${config.name} sin créditos.`);
    }
    throw new Error(`${config.name} error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`${config.name}: no JSON array in response`);
  return JSON.parse(jsonMatch[0]);
}

// Try a provider, if it fails with rate limit, try fallbacks
async function callAIWithFallback(
  primaryProvider: Exclude<Provider, "pipeline">,
  systemPrompt: string,
  userPrompt: string,
  customKeys?: Record<string, string>
): Promise<{ contacts: RawContact[]; usedProvider: string }> {
  // Build fallback order: primary first, then others with keys available
  const fallbackOrder: Exclude<Provider, "pipeline">[] = [primaryProvider];
  const allProviders: Exclude<Provider, "pipeline">[] = ["groq", "openrouter", "together", "cerebras", "deepinfra", "sambanova", "mistral", "deepseek", "lovable"];
  
  for (const p of allProviders) {
    if (!fallbackOrder.includes(p)) fallbackOrder.push(p);
  }

  for (const provider of fallbackOrder) {
    try {
      const config = getProviderConfig(provider, customKeys);
      const contacts = await callAI(config, systemPrompt, userPrompt, provider);
      return { contacts, usedProvider: config.name };
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("no configurada")) continue; // No key, skip
      if (msg.includes("RATE_LIMIT") || msg.includes("CREDITS_EXHAUSTED")) {
        console.log(`${provider} exhausted, trying next...`);
        continue;
      }
      // Other error, still try next
      console.error(`${provider} failed:`, msg);
      continue;
    }
  }

  throw new Error("Todos los proveedores fallaron. Revisá tus API keys en Configuración.");
}

async function pipelineBatch(batch: RawContact[], customKeys?: Record<string, string>): Promise<{ contacts: RawContact[]; stages: string[] }> {
  const stages: string[] = [];

  // Stage 1: Clean
  let cleaned: RawContact[];
  try {
    const result = await callAIWithFallback("groq", SYSTEM_CLEAN, buildCleanPrompt(batch), customKeys);
    cleaned = result.contacts;
    stages.push(`Limpieza: ${result.usedProvider} OK`);
  } catch (e) {
    console.error("Pipeline stage 1 error:", e);
    cleaned = batch;
    stages.push(`Limpieza: FALLO - ${(e as Error).message}`);
  }

  // Stage 2: Verify
  let verified: (RawContact & { issues?: string[] })[];
  try {
    const result = await callAIWithFallback("openrouter", SYSTEM_VERIFY, buildVerifyPrompt(batch, cleaned), customKeys);
    verified = result.contacts as any;
    const issueCount = verified.reduce((acc, v) => acc + (v.issues?.length || 0), 0);
    stages.push(`Verificacion: ${result.usedProvider} OK (${issueCount} issues)`);
  } catch (e) {
    console.error("Pipeline stage 2 error:", e);
    verified = cleaned.map(c => ({ ...c, issues: [] }));
    stages.push(`Verificacion: FALLO - ${(e as Error).message}`);
  }

  // Stage 3: Correct
  const hasIssues = verified.some(v => v.issues && v.issues.length > 0);
  let corrected: RawContact[];

  if (hasIssues) {
    try {
      const result = await callAIWithFallback("lovable", SYSTEM_CORRECT, buildCorrectPrompt(verified), customKeys);
      corrected = result.contacts;
      stages.push(`Correccion: ${result.usedProvider} OK`);
    } catch (e) {
      console.error("Pipeline stage 3 error:", e);
      corrected = cleaned;
      stages.push(`Correccion: FALLO - ${(e as Error).message}`);
    }
  } else {
    corrected = cleaned;
    stages.push(`Correccion: Sin issues, paso omitido`);
  }

  return { contacts: corrected, stages };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contacts, provider: providerParam, customKeys } = await req.json() as {
      contacts: RawContact[];
      provider?: Provider;
      customKeys?: Record<string, string>;
    };

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return new Response(JSON.stringify({ error: "No contacts provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provider = providerParam || "lovable";

    // Pipeline mode
    if (provider === "pipeline") {
      console.log(`Pipeline mode for ${contacts.length} contacts`);
      const batchSize = 20;
      const allCleaned: RawContact[] = [];
      const allStages: string[] = [];

      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);
        const result = await pipelineBatch(batch, customKeys);
        allCleaned.push(...result.contacts);
        if (i === 0) allStages.push(...result.stages);
      }

      return new Response(JSON.stringify({
        contacts: allCleaned,
        provider: "Pipeline (con rotación automática)",
        stages: allStages,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single provider mode with fallback
    console.log(`Using provider: ${provider} for ${contacts.length} contacts`);
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
        console.error(`Batch error:`, e);
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
