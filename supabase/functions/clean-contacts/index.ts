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

type Provider = "lovable" | "groq" | "openrouter" | "pipeline";

interface ProviderConfig {
  url: string;
  apiKey: string;
  model: string;
  name: string;
}

function getProviderConfig(provider: Exclude<Provider, "pipeline">): ProviderConfig {
  switch (provider) {
    case "groq": {
      const key = Deno.env.get("GROQ_API_KEY");
      if (!key) throw new Error("GROQ_API_KEY no configurada");
      return {
        url: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: key,
        model: "llama-3.3-70b-versatile",
        name: "Groq (Llama 3.3 70B)",
      };
    }
    case "openrouter": {
      const key = Deno.env.get("OPENROUTER_API_KEY");
      if (!key) throw new Error("OPENROUTER_API_KEY no configurada");
      return {
        url: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: key,
        model: "mistralai/mistral-small-3.2-24b-instruct:free",
        name: "OpenRouter (Mistral Small Free)",
      };
    }
    default: {
      const key = Deno.env.get("LOVABLE_API_KEY");
      if (!key) throw new Error("LOVABLE_API_KEY no configurada");
      return {
        url: "https://ai.gateway.lovable.dev/v1/chat/completions",
        apiKey: key,
        model: "google/gemini-3-flash-preview",
        name: "Lovable AI (Gemini Flash)",
      };
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
    throw new Error(`${config.name} error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`${config.name}: no JSON array in response`);
  return JSON.parse(jsonMatch[0]);
}

async function pipelineBatch(batch: RawContact[]): Promise<{ contacts: RawContact[]; stages: string[] }> {
  const stages: string[] = [];

  // Stage 1: Groq cleans (fastest)
  let groqConfig: ProviderConfig;
  try {
    groqConfig = getProviderConfig("groq");
  } catch {
    groqConfig = getProviderConfig("lovable");
  }

  let cleaned: RawContact[];
  try {
    cleaned = await callAI(groqConfig, SYSTEM_CLEAN, buildCleanPrompt(batch), "groq");
    stages.push(`Limpieza: ${groqConfig.name} OK`);
  } catch (e) {
    console.error("Pipeline stage 1 error:", e);
    cleaned = batch;
    stages.push(`Limpieza: ${groqConfig.name} FALLO - usando originales`);
  }

  // Stage 2: OpenRouter verifies
  let orConfig: ProviderConfig;
  try {
    orConfig = getProviderConfig("openrouter");
  } catch {
    orConfig = getProviderConfig("lovable");
  }

  let verified: (RawContact & { issues?: string[] })[];
  try {
    verified = await callAI(orConfig, SYSTEM_VERIFY, buildVerifyPrompt(batch, cleaned), "openrouter") as any;
    const issueCount = verified.reduce((acc, v) => acc + (v.issues?.length || 0), 0);
    stages.push(`Verificacion: ${orConfig.name} OK (${issueCount} issues)`);
  } catch (e) {
    console.error("Pipeline stage 2 error:", e);
    verified = cleaned.map(c => ({ ...c, issues: [] }));
    stages.push(`Verificacion: ${orConfig.name} FALLO - sin verificar`);
  }

  // Stage 3: Lovable AI corrects
  let lovableConfig: ProviderConfig;
  try {
    lovableConfig = getProviderConfig("lovable");
  } catch {
    // All failed, return what we have
    return { contacts: cleaned, stages };
  }

  let corrected: RawContact[];
  const hasIssues = verified.some(v => v.issues && v.issues.length > 0);

  if (hasIssues) {
    try {
      corrected = await callAI(lovableConfig, SYSTEM_CORRECT, buildCorrectPrompt(verified), "lovable");
      stages.push(`Correccion: ${lovableConfig.name} OK`);
    } catch (e) {
      console.error("Pipeline stage 3 error:", e);
      corrected = cleaned;
      stages.push(`Correccion: ${lovableConfig.name} FALLO - usando limpiados`);
    }
  } else {
    // No issues found, skip correction
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
    const { contacts, provider: providerParam } = await req.json() as {
      contacts: RawContact[];
      provider?: Provider;
    };

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return new Response(JSON.stringify({ error: "No contacts provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provider = providerParam || "lovable";

    // Pipeline mode: use all 3 AIs
    if (provider === "pipeline") {
      console.log(`Pipeline mode for ${contacts.length} contacts`);
      const batchSize = 20;
      const allCleaned: RawContact[] = [];
      const allStages: string[] = [];

      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);
        const result = await pipelineBatch(batch);
        allCleaned.push(...result.contacts);
        if (i === 0) allStages.push(...result.stages); // Only log stages for first batch
      }

      return new Response(JSON.stringify({
        contacts: allCleaned,
        provider: "Pipeline 3 IAs (Groq + OpenRouter + Lovable)",
        stages: allStages,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single provider mode
    let config: ProviderConfig;
    try {
      config = getProviderConfig(provider);
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Using provider: ${config.name} for ${contacts.length} contacts`);

    const batchSize = 25;
    const allCleaned: RawContact[] = [];

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);

      try {
        const cleaned = await callAI(config, SYSTEM_CLEAN, buildCleanPrompt(batch), provider);
        allCleaned.push(...cleaned);
      } catch (e) {
        console.error(`Batch error:`, e);
        if ((e as Error).message.includes("429")) {
          return new Response(
            JSON.stringify({ error: `Rate limit en ${config.name}. Intenta de nuevo en unos segundos.` }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        allCleaned.push(...batch);
      }
    }

    return new Response(JSON.stringify({ contacts: allCleaned, provider: config.name }), {
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
