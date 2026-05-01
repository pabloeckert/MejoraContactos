/**
 * Unified Error Handler — Centralized error handling for MejoraContactos.
 *
 * Replaces scattered try-catch blocks with a consistent approach:
 * - Typed error categories for better filtering
 * - Automatic context enrichment (component, action, stack)
 * - Integration with error-reporter (captureError)
 * - Severity-based routing (console vs capture vs both)
 * - Async wrapper utilities to reduce boilerplate
 */

import { captureError } from "./error-reporter";

// ── Types ─────────────────────────────────────────────────

export type ErrorCategory =
  | "parse"        // File parsing (CSV, Excel, VCF, JSON)
  | "validation"   // Contact validation (rules + AI)
  | "pipeline"     // Processing pipeline orchestration
  | "ai"           // AI provider calls
  | "storage"      // IndexedDB / localStorage
  | "export"       // Export operations
  | "network"      // API / Edge Function calls
  | "crypto"       // Encryption / decryption
  | "unknown";

export type ErrorSeverity = "low" | "medium" | "high" | "critical";

interface HandlerContext {
  component: string;
  action: string;
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  extra?: Record<string, unknown>;
  silent?: boolean; // If true, only log to console (no capture)
}

// ── Severity defaults by category ─────────────────────────

const DEFAULT_SEVERITY: Record<ErrorCategory, ErrorSeverity> = {
  parse: "medium",
  validation: "low",
  pipeline: "high",
  ai: "medium",
  storage: "low",
  export: "medium",
  network: "high",
  crypto: "high",
  unknown: "medium",
};

// ── Core handler ──────────────────────────────────────────

/**
 * Handle an error with full context. Routes to console, captureError, or both.
 *
 * @returns The original error (for re-throwing if needed)
 */
export function handleError(
  error: unknown,
  context: HandlerContext
): Error {
  const err = normalizeError(error);
  const category = context.category || "unknown";
  const severity = context.severity || DEFAULT_SEVERITY[category];

  // Always console in development
  const isDev = import.meta.env.DEV;

  const enrichedExtra = {
    category,
    severity,
    ...context.extra,
  };

  if (context.silent && severity === "low") {
    // Silent + low severity → console only
    if (isDev) {
      console.warn(`[${context.component}:${context.action}]`, err.message, enrichedExtra);
    }
  } else {
    // Capture to error-reporter (webhook, Supabase, sessionStorage)
    captureError(err, {
      component: context.component,
      action: context.action,
      extra: enrichedExtra,
    });

    if (isDev) {
      console.error(`[${context.component}:${context.action}]`, err.message, enrichedExtra);
    }
  }

  return err;
}

// ── Async wrapper ─────────────────────────────────────────

/**
 * Wraps an async function with unified error handling.
 * Returns a fallback value on error instead of throwing.
 *
 * @example
 * const data = await safeAsync(
 *   () => parseFile(file),
 *   { component: "parsers", action: "parseFile", category: "parse" },
 *   null // fallback
 * );
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context: HandlerContext,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    handleError(error, context);
    return fallback;
  }
}

/**
 * Wraps a sync function with unified error handling.
 * Returns a fallback value on error instead of throwing.
 *
 * @example
 * const parsed = safeSync(
 *   () => JSON.parse(raw),
 *   { component: "ai-validator", action: "parseResponse", category: "ai" },
 *   null
 * );
 */
export function safeSync<T>(
  fn: () => T,
  context: HandlerContext,
  fallback: T
): T {
  try {
    return fn();
  } catch (error) {
    handleError(error, context);
    return fallback;
  }
}

// ── Storage error handler (convenience) ───────────────────

/**
 * Specialized handler for localStorage/sessionStorage errors.
 * Used by usage-limits, feature-flags, api-keys, etc.
 */
export function handleStorageError(
  error: unknown,
  component: string,
  action: string
): void {
  handleError(error, {
    component,
    action,
    category: "storage",
    severity: "low",
    silent: true, // Storage errors are expected in private browsing
  });
}

// ── AI error handler (convenience) ────────────────────────

/**
 * Specialized handler for AI provider call failures.
 * Includes provider info for debugging rotation issues.
 */
export function handleAIError(
  error: unknown,
  component: string,
  provider: string,
  action: string = "ai_call"
): void {
  handleError(error, {
    component,
    action,
    category: "ai",
    severity: "medium",
    extra: { provider },
  });
}

// ── Parse error handler (convenience) ─────────────────────

/**
 * Specialized handler for file parsing errors.
 * Includes file info for debugging.
 */
export function handleParseError(
  error: unknown,
  fileName: string,
  fileType: string
): void {
  handleError(error, {
    component: "parsers",
    action: `parse_${fileType.toLowerCase()}`,
    category: "parse",
    severity: "medium",
    extra: { fileName, fileType },
  });
}

// ── Utilities ─────────────────────────────────────────────

/**
 * Normalize any thrown value into a proper Error object.
 */
function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  if (typeof error === "object" && error !== null) {
    const msg = (error as Record<string, unknown>).message;
    if (typeof msg === "string") return new Error(msg);
  }
  return new Error(`Unknown error: ${String(error)}`);
}

/**
 * Extract a user-friendly message from an error.
 * Strips technical prefixes, limits length.
 */
export function toUserMessage(error: unknown): string {
  const err = normalizeError(error);
  let msg = err.message;

  // Strip common technical prefixes
  msg = msg.replace(/^Error:\s*/i, "");
  msg = msg.replace(/^TypeError:\s*/i, "");
  msg = msg.replace(/^SyntaxError:\s*/i, "");

  // Limit length
  if (msg.length > 200) msg = msg.slice(0, 197) + "...";

  return msg || "Ocurrió un error inesperado";
}
