/**
 * Error reporting utility — Enhanced v2
 *
 * Captures unhandled errors, stores locally, and optionally sends
 * to a Supabase Edge Function for centralized logging.
 *
 * To upgrade to Sentry later:
 * 1. npm install @sentry/react
 * 2. Add SENTRY_DSN to .env
 * 3. Replace captureError() with Sentry.captureException()
 */

interface ErrorContext {
  component?: string;
  action?: string;
  extra?: Record<string, unknown>;
}

interface ErrorReport {
  message: string;
  stack?: string;
  timestamp: string;
  url: string;
  userAgent: string;
  component?: string;
  action?: string;
  extra?: Record<string, unknown>;
  sessionId: string;
  appVersion: string;
}

const SESSION_ID = crypto.randomUUID();
const APP_VERSION = "v12.0-beta";
const MAX_STORED_ERRORS = 20;
const STORAGE_KEY = "__mc_errors__";
const WEBHOOK_KEY = "__mc_error_webhook__";

// ── Storage ──────────────────────────────────────────────

function getStoredErrors(): ErrorReport[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function storeError(report: ErrorReport) {
  try {
    const existing = getStoredErrors();
    existing.push(report);
    if (existing.length > MAX_STORED_ERRORS) existing.shift();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // sessionStorage full — clear and retry
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([report]));
    } catch { /* give up */ }
  }
}

// ── Webhook (optional) ──────────────────────────────────

function getWebhookUrl(): string | null {
  try {
    return localStorage.getItem(WEBHOOK_KEY);
  } catch {
    return null;
  }
}

export function setErrorWebhook(url: string) {
  try {
    localStorage.setItem(WEBHOOK_KEY, url);
  } catch { /* ignore */ }
}

async function sendToWebhook(report: ErrorReport) {
  const webhook = getWebhookUrl();
  if (!webhook) return;

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🔴 **MejoraContactos Error**\n\`${report.message}\`\n📍 ${report.component || "unknown"} → ${report.action || "unknown"}\n🔗 ${report.url}\n⏰ ${report.timestamp}`,
        // Discord/Slack webhook format
        embeds: [{
          title: report.message.slice(0, 256),
          description: report.stack?.slice(0, 2000) || "No stack trace",
          color: 0xFF0000,
          fields: [
            { name: "Component", value: report.component || "N/A", inline: true },
            { name: "Action", value: report.action || "N/A", inline: true },
            { name: "URL", value: report.url, inline: false },
          ],
          timestamp: report.timestamp,
        }],
      }),
    });
  } catch {
    // Webhook failed — silently ignore (don't create error loop)
  }
}

// ── Supabase Edge Function (optional) ───────────────────

async function sendToSupabase(report: ErrorReport) {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.functions.invoke("log-error", { body: report });
  } catch {
    // Edge Function not deployed yet — ignore
  }
}

// ── Main API ────────────────────────────────────────────

export function captureError(error: Error, context?: ErrorContext) {
  const report: ErrorReport = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    component: context?.component,
    action: context?.action,
    extra: context?.extra,
    sessionId: SESSION_ID,
    appVersion: APP_VERSION,
  };

  // 1. Console log (always)
  console.error("[ErrorReporter]", report);

  // 2. Store locally
  storeError(report);

  // 3. Send to webhook (Discord/Slack — optional, async, non-blocking)
  sendToWebhook(report);

  // 4. Send to Supabase Edge Function (optional, async, non-blocking)
  sendToSupabase(report);
}

export function getRecentErrors(): ErrorReport[] {
  return getStoredErrors();
}

export function clearErrors() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

// ── Auto-init: capture unhandled errors ─────────────────

let initialized = false;

export function initErrorReporting() {
  if (initialized) return;
  initialized = true;

  // Unhandled errors
  window.addEventListener("error", (event) => {
    captureError(event.error || new Error(event.message), {
      component: "window",
      action: "unhandled_error",
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));
    captureError(error, {
      component: "window",
      action: "unhandled_rejection",
    });
  });

  console.log("[ErrorReporter] Initialized — capturing unhandled errors");
}
