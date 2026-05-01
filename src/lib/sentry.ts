/**
 * Sentry Configuration — Error tracking for MejoraContactos.
 *
 * Sentry is initialized in main.tsx BEFORE the app renders.
 * Integration point: error-reporter.ts captureError() sends to Sentry
 * as one of its channels, avoiding duplicate reports.
 *
 * Environment variables:
 *   VITE_SENTRY_DSN     — Sentry DSN (required)
 *   VITE_SENTRY_ENV     — Environment name (default: "production")
 *   VITE_SENTRY_RELEASE — Release version (default: APP_VERSION)
 *
 * To disable Sentry in dev: don't set VITE_SENTRY_DSN.
 */

import * as Sentry from "@sentry/react";
import { APP_VERSION } from "./error-reporter";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const SENTRY_ENV = (import.meta.env.VITE_SENTRY_ENV as string) || "production";

let sentryInitialized = false;

/**
 * Initialize Sentry. Called once from main.tsx.
 * No-op if VITE_SENTRY_DSN is not set (safe for dev/localhost).
 */
export function initSentry(): void {
  if (sentryInitialized) return;
  if (!SENTRY_DSN) {
    console.log("[Sentry] No DSN configured — error tracking disabled");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENV,
    release: APP_VERSION,

    // Performance monitoring (10% of transactions in production)
    tracesSampleRate: 0.1,

    // Don't send errors from localhost/dev
    enabled: !import.meta.env.DEV,

    // Reduce noise: ignore common non-critical errors
    ignoreErrors: [
      // Browser extension noise
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // Network errors (handled by app)
      "NetworkError",
      "Failed to fetch",
      "Load failed",
      // AbortController
      "The operation was aborted",
      "AbortError",
    ],

    // Don't send sensitive data
    beforeSend(event) {
      // Strip API keys from breadcrumbs if any leaked
      if (event.breadcrumbs) {
        for (const bc of event.breadcrumbs) {
          if (bc.data) {
            for (const key of Object.keys(bc.data)) {
              if (/api[_-]?key|token|secret|password/i.test(key)) {
                bc.data[key] = "[REDACTED]";
              }
            }
          }
        }
      }
      return event;
    },
  });

  sentryInitialized = true;
  console.log("[Sentry] Initialized — DSN configured, env:", SENTRY_ENV);
}

/**
 * Capture an error to Sentry with structured context.
 * Called by error-reporter.ts captureError().
 *
 * @param error — The error to capture
 * @param context — Structured context from error-handler
 */
export function captureToSentry(
  error: Error,
  context: {
    component?: string;
    action?: string;
    category?: string;
    severity?: string;
    extra?: Record<string, unknown>;
  }
): void {
  if (!sentryInitialized) return;

  Sentry.withScope((scope) => {
    // Tags for filtering in Sentry UI
    if (context.category) scope.setTag("category", context.category);
    if (context.severity) scope.setTag("severity", context.severity);
    if (context.component) scope.setTag("component", context.component);
    if (context.action) scope.setTag("action", context.action);

    // Extract provider from extra if present
    const provider = context.extra?.provider;
    if (typeof provider === "string") scope.setTag("provider", provider);

    // Set severity level
    const sentryLevel = severityToSentryLevel(context.severity);
    scope.setLevel(sentryLevel);

    // Context extras (visible in Sentry UI)
    if (context.extra) {
      scope.setExtras(context.extra);
    }

    // Fingerprint: group errors by component + action + message
    scope.setFingerprint([
      context.component || "unknown",
      context.action || "unknown",
      error.message,
    ]);

    Sentry.captureException(error);
  });
}

/**
 * Set user context for Sentry (non-PII).
 */
export function setSentryUser(userId: string): void {
  if (!sentryInitialized) return;
  Sentry.setUser({ id: userId });
}

/**
 * Add breadcrumb for navigation/action tracking.
 */
export function addSentryBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): void {
  if (!sentryInitialized) return;
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: "info",
  });
}

function severityToSentryLevel(severity?: string): Sentry.SeverityLevel {
  switch (severity) {
    case "critical": return "fatal";
    case "high": return "error";
    case "medium": return "warning";
    case "low": return "info";
    default: return "error";
  }
}
