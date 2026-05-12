import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = [
  "https://pabloeckert.github.io",
  "https://mejoraok.com",
  "http://localhost:8080",
  "http://localhost:5173",
];

// In-memory error log (last 100 errors)
const errorLog: Array<Record<string, unknown>> = [];
const MAX_LOG = 100;

function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    // Validate required fields
    if (!body.message || !body.timestamp) {
      return new Response(JSON.stringify({ error: "Missing required fields: message, timestamp" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize and store
    const entry = {
      message: String(body.message).slice(0, 500),
      stack: body.stack ? String(body.stack).slice(0, 2000) : null,
      timestamp: String(body.timestamp),
      url: body.url ? String(body.url).slice(0, 500) : null,
      component: body.component ? String(body.component).slice(0, 100) : null,
      action: body.action ? String(body.action).slice(0, 100) : null,
      sessionId: body.sessionId ? String(body.sessionId).slice(0, 50) : null,
      appVersion: body.appVersion ? String(body.appVersion).slice(0, 20) : null,
      userAgent: body.userAgent ? String(body.userAgent).slice(0, 200) : null,
      receivedAt: new Date().toISOString(),
      ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown",
    };

    errorLog.push(entry);
    if (errorLog.length > MAX_LOG) errorLog.shift();

    console.log(`[log-error] ${entry.message} (${entry.component}/${entry.action})`);

    return new Response(JSON.stringify({ ok: true, stored: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[log-error] Parse error:", err);
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
