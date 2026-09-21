// contactos-api: gateway hacia contactos_finales para sistemas externos
// (MejoraCRM hoy, MejoraWS más adelante). Nadie recibe la service_role key
// ni acceso directo a la tabla -- cada sistema tiene su propia API key
// (header X-Api-Key), verificada acá adentro contra el hash guardado en
// contactos_api_keys, y esta función es la única que habla con Postgres
// usando el service role.
//
// Cómo dar de alta una key nueva para un sistema (ej. MejoraCRM):
//   1. Generar un token random fuerte, ej. en una terminal:
//        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//   2. Calcular su hash SHA-256 (mismo algoritmo que usa esta función, ver
//      sha256Hex más abajo) -- se puede hacer con el mismo Node:
//        node -e "console.log(require('crypto').createHash('sha256').update('EL_TOKEN_DEL_PASO_1').digest('hex'))"
//   3. Insertar una fila en contactos_api_keys (desde el SQL editor de
//      Supabase o vía service role, nunca con la anon key). puede_escribir
//      default false -- solo ponerlo true si ese sistema necesita CREAR/
//      ACTUALIZAR contactos (ej. MejoraCRM), no si solo los lee:
//        INSERT INTO contactos_api_keys (sistema, key_hash, puede_escribir)
//        VALUES ('mejoracrm', 'EL_HASH_DEL_PASO_2', true);
//   4. Darle el token del paso 1 (nunca el hash) al sistema consumidor, para
//      que lo mande como header X-Api-Key en cada request. No queda
//      guardado en ningún lado en texto plano -- si se pierde, se revoca
//      (UPDATE contactos_api_keys SET activo = false WHERE sistema = '...')
//      y se repite el proceso con un token nuevo.
//
// GET /contactos-api?desde=<ISO8601>&pagina=<n>&tamano=<n>
//   Lectura, cualquier key activa. desde filtra updated_at >= desde (para
//   sincronización incremental). pagina/tamano: paginación simple, tamano
//   tope 2000, default 500.
//
// POST /contactos-api
//   Crear o actualizar UN contacto. Requiere una key con puede_escribir=true.
//   Body JSON, todos los campos opcionales salvo que se indique:
//     { persona_id?, nombre, apellido, cargo, organizacion,
//       whatsapp: string[], telefono_fijo: string[], emails: string[],
//       tag, domicilio, ciudad, provincia, pais, cumpleanos, foto_url,
//       nota_referencia }
//   Sin persona_id -> crea uno nuevo, origen = el sistema de la API key
//   (ej. 'mejoracrm'), cluster_id queda NULL (no pasó por el pipeline de
//   dedup local de motor-contactos todavía -- ver limitación conocida en
//   INFORME-SINCRONIZACION-CONTACTOS.md, repo MejoraCRM).
//   Con persona_id -> actualiza esa fila si existe (404 si no). origen NO
//   se toca en un update (es procedencia original, no "quién lo tocó
//   último" -- eso ya lo cubre sincronizado_en).
//   Responde { persona_id, creado: boolean }.

const TAMANO_DEFAULT = 500;
const TAMANO_MAXIMO = 2000;

const CAMPOS_CONTACTO = [
  "nombre",
  "apellido",
  "cargo",
  "organizacion",
  "whatsapp",
  "telefono_fijo",
  "emails",
  "tag",
  "domicilio",
  "ciudad",
  "provincia",
  "pais",
  "cumpleanos",
  "foto_url",
  "nota_referencia",
] as const;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
  };
}

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function sha256Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Verificacion {
  ok: true;
  sistema: string;
  keyId: string;
  puedeEscribir: boolean;
}
type ResultadoVerificacion = Verificacion | { ok: false; error: string; status: number };

async function verificarApiKey(supabaseUrl: string, serviceKey: string, apiKey: string | null): Promise<ResultadoVerificacion> {
  if (!apiKey) {
    return { ok: false, error: "Falta el header X-Api-Key o Authorization", status: 401 };
  }

  const hash = await sha256Hex(apiKey);
  const res = await fetch(
    `${supabaseUrl}/rest/v1/contactos_api_keys?key_hash=eq.${hash}&select=id,sistema,activo,puede_escribir`,
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
  return { ok: true, sistema: fila.sistema, keyId: fila.id, puedeEscribir: !!fila.puede_escribir };
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

function registrarSync(
  supabaseUrl: string,
  serviceKey: string,
  sistema: string,
  direccion: "push" | "pull",
  cantidad: number,
  exito: boolean,
  error?: string,
): void {
  // Fire-and-forget, igual que marcarUltimoUso -- la auditoría nunca debe
  // hacer más lenta ni más frágil la respuesta real al consumidor.
  fetch(`${supabaseUrl}/rest/v1/contactos_sync_log`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ sistema, direccion, cantidad, exito, error: error ?? null }),
  }).catch((err) => console.error("[contactos-api] no se pudo escribir contactos_sync_log:", err));
}

async function manejarGet(req: Request, supabaseUrl: string, serviceKey: string, v: Verificacion, cors: Record<string, string>): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const desde = params.get("desde");
  const pagina = Math.max(parseInt(params.get("pagina") || "1", 10) || 1, 1);
  const tamano = Math.min(Math.max(parseInt(params.get("tamano") || "", 10) || TAMANO_DEFAULT, 1), TAMANO_MAXIMO);
  const offset = (pagina - 1) * tamano;

  let query = `${supabaseUrl}/rest/v1/contactos_finales?select=*&order=persona_id.asc&limit=${tamano}&offset=${offset}`;
  if (desde) {
    query += `&updated_at=gte.${encodeURIComponent(desde)}`;
  }
  const tag = params.get("tag");
  if (tag) {
    query += `&tag=eq.${encodeURIComponent(tag)}`;
  }

  const res = await fetch(query, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact" },
  });
  if (!res.ok) {
    const texto = await res.text();
    console.error("[contactos-api] error consultando contactos_finales:", res.status, texto);
    registrarSync(supabaseUrl, serviceKey, v.sistema, "pull", 0, false, `HTTP ${res.status}: ${texto.slice(0, 300)}`);
    return jsonResponse({ error: "Error interno consultando contactos" }, 502, cors);
  }

  const contactos = await res.json();
  const rangoTotal = res.headers.get("content-range"); // "0-499/8541"
  const total = rangoTotal ? parseInt(rangoTotal.split("/")[1] || "0", 10) : contactos.length;

  console.log(`[contactos-api] ${v.sistema}: pull ${contactos.length}/${total} contactos (pagina ${pagina})`);
  registrarSync(supabaseUrl, serviceKey, v.sistema, "pull", contactos.length, true);

  return jsonResponse({ total, pagina, tamano, contactos }, 200, cors);
}

async function manejarPost(req: Request, supabaseUrl: string, serviceKey: string, v: Verificacion, cors: Record<string, string>): Promise<Response> {
  if (!v.puedeEscribir) {
    return jsonResponse({ error: `La key de '${v.sistema}' es de solo lectura` }, 403, cors);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body inválido, se esperaba JSON" }, 400, cors);
  }

  const fila: Record<string, unknown> = {};
  for (const campo of CAMPOS_CONTACTO) {
    if (body[campo] !== undefined) fila[campo] = body[campo];
  }

  // Compatibilidad con payloads planos (ej. MejoraDiagnostico)
  if (typeof body.email === "string" && body.email.trim() && (!fila.emails || (Array.isArray(fila.emails) && fila.emails.length === 0))) {
    fila.emails = [body.email.trim()];
  }
  if (typeof body.telefono === "string" && body.telefono.trim() && (!fila.whatsapp || (Array.isArray(fila.whatsapp) && fila.whatsapp.length === 0))) {
    fila.whatsapp = [body.telefono.trim()];
  }

  // Compatibilidad con metadata (ej. MejoraSM { red, handle } o Mejoraok { origen_cta })
  if (body.metadata && typeof body.metadata === "object") {
    const meta = body.metadata as Record<string, unknown>;
    if (meta.red && typeof meta.red === "string") {
      if (!fila.tag) fila.tag = meta.red;
      if (!fila.nota_referencia) {
        const handleSuffix = meta.handle && typeof meta.handle === "string" ? ` (@${meta.handle.replace(/^@/, '')})` : "";
        fila.nota_referencia = `[MejoraSM] Canal: ${meta.red}${handleSuffix}`;
      }
    }
    if (meta.origen_cta && typeof meta.origen_cta === "string") {
      if (!fila.tag) fila.tag = `landing_${meta.origen_cta}`;
      if (!fila.nota_referencia) {
        fila.nota_referencia = `[Mejoraok] CTA: ${meta.origen_cta}`;
      }
    }
  }

  const ahora = new Date().toISOString();
  fila.updated_at = ahora;

  const personaIdExistente = typeof body.persona_id === "string" ? body.persona_id : null;

  if (personaIdExistente) {
    // Update: no tocar origen (procedencia original) ni cluster_id.
    const res = await fetch(
      `${supabaseUrl}/rest/v1/contactos_finales?persona_id=eq.${personaIdExistente}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(fila),
      },
    );
    if (!res.ok) {
      const texto = await res.text();
      console.error("[contactos-api] error actualizando contacto:", res.status, texto);
      registrarSync(supabaseUrl, serviceKey, v.sistema, "push", 0, false, `HTTP ${res.status}: ${texto.slice(0, 300)}`);
      return jsonResponse({ error: "Error interno actualizando el contacto" }, 502, cors);
    }
    const filas = await res.json();
    if (filas.length === 0) {
      registrarSync(supabaseUrl, serviceKey, v.sistema, "push", 0, false, `persona_id no encontrado: ${personaIdExistente}`);
      return jsonResponse({ error: `No existe ningún contacto con persona_id ${personaIdExistente}` }, 404, cors);
    }
    console.log(`[contactos-api] ${v.sistema}: push update ${personaIdExistente}`);
    registrarSync(supabaseUrl, serviceKey, v.sistema, "push", 1, true);
    return jsonResponse({ persona_id: personaIdExistente, creado: false }, 200, cors);
  }

  // Create: nuevo persona_id, origen = el sistema autenticado, sin cluster_id
  // (no pasó por motor-contactos todavía).
  const nuevoPersonaId = crypto.randomUUID();
  fila.persona_id = nuevoPersonaId;
  let origenFinal = v.sistema;
  const rawOrigen = (typeof body.source === "string" && body.source.trim()) || (typeof body.origen === "string" && body.origen.trim());
  if (rawOrigen) {
    if (rawOrigen.toLowerCase() === "mejora_sm" || rawOrigen.toLowerCase() === "mejorasm") {
      origenFinal = "MejoraSM";
    } else if (rawOrigen.toLowerCase() === "mejora_app" || rawOrigen.toLowerCase() === "mejoraapp") {
      origenFinal = "MejoraApp";
    } else if (rawOrigen.toLowerCase() === "mejoraok" || rawOrigen.toLowerCase() === "mejora_ok") {
      origenFinal = "Mejoraok";
    } else {
      origenFinal = rawOrigen;
    }
  }
  fila.origen = origenFinal;

  const res = await fetch(`${supabaseUrl}/rest/v1/contactos_finales`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(fila),
  });
  if (!res.ok) {
    const texto = await res.text();
    console.error("[contactos-api] error creando contacto:", res.status, texto);
    registrarSync(supabaseUrl, serviceKey, v.sistema, "push", 0, false, `HTTP ${res.status}: ${texto.slice(0, 300)}`);
    return jsonResponse({ error: "Error interno creando el contacto" }, 502, cors);
  }

  console.log(`[contactos-api] ${v.sistema}: push create ${nuevoPersonaId}`);
  registrarSync(supabaseUrl, serviceKey, v.sistema, "push", 1, true);
  return jsonResponse({ persona_id: nuevoPersonaId, creado: true }, 201, cors);
}

async function manejarHealth(supabaseUrl: string, serviceKey: string, cors: Record<string, string>): Promise<Response> {
  // 1. Total de contactos en contactos_finales
  const resCount = await fetch(`${supabaseUrl}/rest/v1/contactos_finales?select=persona_id&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact" },
  });
  let totalContactos = 0;
  if (resCount.ok) {
    const contentRange = resCount.headers.get("content-range");
    if (contentRange && contentRange.includes("/")) {
      totalContactos = parseInt(contentRange.split("/")[1] || "0", 10);
    }
  }

  // 2. Sistemas activos en contactos_api_keys
  const resKeys = await fetch(
    `${supabaseUrl}/rest/v1/contactos_api_keys?select=sistema,activo,ultimo_uso_en,puede_escribir&activo=eq.true&order=sistema.asc`,
    {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }
  );
  let sistemasConectados: string[] = [];
  let detallesSistemas: Record<string, unknown>[] = [];
  if (resKeys.ok) {
    detallesSistemas = await resKeys.json();
    sistemasConectados = detallesSistemas.map((f) => f.sistema as string);
  }

  return jsonResponse(
    {
      status: "ok",
      total_contactos: totalContactos,
      sistemas_conectados: sistemasConectados,
      detalles_sistemas: detallesSistemas,
      timestamp: new Date().toISOString(),
    },
    200,
    cors
  );
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, cors);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[contactos-api] faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY en el entorno de la función");
    return jsonResponse({ error: "Server misconfiguration" }, 500, cors);
  }

  const authHeader = req.headers.get("Authorization");
  const bearerToken = authHeader ? authHeader.replace(/^Bearer\s+/i, "").trim() : null;
  const apiKey = req.headers.get("X-Api-Key") || (bearerToken || null);

  const urlObj = new URL(req.url);
  const isHealth = urlObj.pathname.endsWith("/health") || urlObj.searchParams.get("health") === "true";

  if (isHealth && req.method === "GET") {
    if (apiKey) {
      const verificacion = await verificarApiKey(supabaseUrl, serviceKey, apiKey);
      if (verificacion.ok) {
        marcarUltimoUso(supabaseUrl, serviceKey, verificacion.keyId);
      }
    }
    return manejarHealth(supabaseUrl, serviceKey, cors);
  }

  const verificacion = await verificarApiKey(supabaseUrl, serviceKey, apiKey);
  if (!verificacion.ok) {
    return jsonResponse({ error: verificacion.error }, verificacion.status, cors);
  }
  marcarUltimoUso(supabaseUrl, serviceKey, verificacion.keyId);

  if (req.method === "POST") {
    return manejarPost(req, supabaseUrl, serviceKey, verificacion, cors);
  }
  return manejarGet(req, supabaseUrl, serviceKey, verificacion, cors);
});

