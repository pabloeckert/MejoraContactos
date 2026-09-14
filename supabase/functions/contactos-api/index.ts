// contactos-api: gateway de solo lectura hacia contactos_finales para
// sistemas externos (MejoraCRM hoy en preparación, MejoraWS más adelante).
// Nadie recibe la service_role key ni acceso directo a la tabla -- cada
// sistema tiene su propia API key (header X-Api-Key), verificada acá
// adentro contra el hash guardado en contactos_api_keys, y esta función es
// la única que habla con Postgres usando el service role.
//
// Cómo dar de alta una key nueva para un sistema (ej. MejoraCRM):
//   1. Generar un token random fuerte, ej. en una terminal:
//        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//   2. Calcular su hash SHA-256 (mismo algoritmo que usa esta función, ver
//      sha256Hex más abajo) -- se puede hacer con el mismo Node:
//        node -e "console.log(require('crypto').createHash('sha256').update('EL_TOKEN_DEL_PASO_1').digest('hex'))"
//   3. Insertar una fila en contactos_api_keys (desde el SQL editor de
//      Supabase o vía service role, nunca con la anon key):
//        INSERT INTO contactos_api_keys (sistema, key_hash) VALUES ('mejoracrm', 'EL_HASH_DEL_PASO_2');
//   4. Darle el token del paso 1 (nunca el hash) al sistema consumidor, para
//      que lo mande como header X-Api-Key en cada request. No queda
//      guardado en ningún lado en texto plano -- si se pierde, se revoca
//      (UPDATE contactos_api_keys SET activo = false WHERE sistema = '...')
//      y se repite el proceso con un token nuevo.
//
// Endpoint: GET /contactos-api?desde=<ISO8601>&pagina=<n>&tamano=<n>
//   - desde: opcional, filtra updated_at >= desde (para sincronización
//     incremental -- "qué cambió desde la última vez que consulté").
//   - pagina/tamano: paginación simple, tamano tope 2000, default 500.

const TAMANO_DEFAULT = 500;
const TAMANO_MAXIMO = 2000;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
  };
}

async function sha256Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verificarApiKey(
  supabaseUrl: string,
  serviceKey: string,
  apiKey: string | null,
): Promise<{ ok: true; sistema: string; keyId: string } | { ok: false; error: string; status: number }> {
  if (!apiKey) {
    return { ok: false, error: "Falta el header X-Api-Key", status: 401 };
  }

  const hash = await sha256Hex(apiKey);
  const res = await fetch(
    `${supabaseUrl}/rest/v1/contactos_api_keys?key_hash=eq.${hash}&select=id,sistema,activo`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) {
    return { ok: false, error: "No se pudo verificar la API key", status: 502 };
  }
  const filas = await res.json();
  const fila = filas[0];
  if (!fila || !fila.activo) {
    return { ok: false, error: "API key inválida o desactivada", status: 401 };
  }
  return { ok: true, sistema: fila.sistema, keyId: fila.id };
}

function marcarUltimoUso(supabaseUrl: string, serviceKey: string, keyId: string): void {
  // Fire-and-forget: no bloquea la respuesta al consumidor por esto.
  fetch(`${supabaseUrl}/rest/v1/contactos_api_keys?id=eq.${keyId}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ ultimo_uso_en: new Date().toISOString() }),
  }).catch((err) => console.error("[contactos-api] no se pudo actualizar ultimo_uso_en:", err));
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[contactos-api] faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY en el entorno de la función");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const verificacion = await verificarApiKey(supabaseUrl, serviceKey, req.headers.get("X-Api-Key"));
  if (!verificacion.ok) {
    return new Response(JSON.stringify({ error: verificacion.error }), {
      status: verificacion.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  marcarUltimoUso(supabaseUrl, serviceKey, verificacion.keyId);

  const params = new URL(req.url).searchParams;
  const desde = params.get("desde");
  const pagina = Math.max(parseInt(params.get("pagina") || "1", 10) || 1, 1);
  const tamano = Math.min(Math.max(parseInt(params.get("tamano") || "", 10) || TAMANO_DEFAULT, 1), TAMANO_MAXIMO);
  const offset = (pagina - 1) * tamano;

  let query = `${supabaseUrl}/rest/v1/contactos_finales?select=*&order=persona_id.asc&limit=${tamano}&offset=${offset}`;
  if (desde) {
    query += `&updated_at=gte.${encodeURIComponent(desde)}`;
  }

  const res = await fetch(query, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "count=exact",
    },
  });
  if (!res.ok) {
    console.error("[contactos-api] error consultando contactos_finales:", res.status, await res.text());
    return new Response(JSON.stringify({ error: "Error interno consultando contactos" }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const contactos = await res.json();
  const rangoTotal = res.headers.get("content-range"); // "0-499/8541"
  const total = rangoTotal ? parseInt(rangoTotal.split("/")[1] || "0", 10) : contactos.length;

  console.log(`[contactos-api] ${verificacion.sistema}: ${contactos.length}/${total} contactos (pagina ${pagina})`);

  return new Response(
    JSON.stringify({ total, pagina, tamano, contactos }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
