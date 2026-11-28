/**
 * Error reporting utility — local-only buffer in sessionStorage (zero network calls).
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
export const APP_VERSION = "v12.9";
const MAX_STORED_ERRORS = 20;
const STORAGE_KEY = "__mc_errors__";

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

  console.error("[ErrorReporter]", report);
  storeError(report);
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
