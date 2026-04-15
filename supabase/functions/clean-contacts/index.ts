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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contacts } = await req.json() as { contacts: RawContact[] };

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return new Response(JSON.stringify({ error: "No contacts provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Process in batches of 30 to avoid token limits
    const batchSize = 25;
    const allCleaned: RawContact[] = [];

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);

      const prompt = `Sos un asistente experto en limpieza de datos de contactos.
Recibís un array JSON de contactos desordenados. Tu tarea:

1. **Nombre**: Capitalizar correctamente (primera letra mayúscula). Si hay nombre completo en un solo campo, separar en firstName y lastName.
2. **Apellido**: Capitalizar correctamente. 
3. **WhatsApp**: Convertir a formato internacional sin espacios ni guiones, solo números con código de país. Si no tiene código de país, asumir +54 (Argentina). Ejemplo: "+5491112345678". Eliminar el 15 si es un celular argentino (ej: 011-15-1234-5678 → +5491112345678).
4. **Empresa**: Limpiar y capitalizar. Quitar basura como "N/A", "-", ".", etc.
5. **Cargo**: Limpiar y capitalizar. Quitar basura.
6. **Email**: Limpiar, minúsculas, validar formato básico. Si es inválido, dejar vacío.

IMPORTANTE: 
- Si un campo tiene basura irreconocible, dejarlo vacío "".
- NO inventar datos. Si no hay información, dejar vacío.
- Devolvé SOLO el array JSON limpio, sin explicaciones.

Contactos a limpiar:
${JSON.stringify(batch)}`;

      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content:
                  "Sos un limpiador de datos. Respondé SOLO con JSON válido, sin markdown, sin explicaciones.",
              },
              { role: "user", content: prompt },
            ],
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Intentá de nuevo en unos segundos." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "Créditos agotados. Agregá fondos en Settings > Workspace > Usage." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const errText = await response.text();
        console.error("AI Gateway error:", response.status, errText);
        // Return original batch uncleaned on error
        allCleaned.push(...batch);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const cleaned = JSON.parse(jsonMatch[0]);
          allCleaned.push(...cleaned);
        } else {
          allCleaned.push(...batch);
        }
      } catch {
        console.error("Failed to parse AI response:", content);
        allCleaned.push(...batch);
      }
    }

    return new Response(JSON.stringify({ contacts: allCleaned }), {
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
