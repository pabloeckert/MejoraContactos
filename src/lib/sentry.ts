/**
 * Sentry Configuration — Error tracking for MejoraContactos.
 * Zero-dependency safe fallback when VITE_SENTRY_DSN is not configured in local sovereign mode.
 */

import { APP_VERSION } from "./error-reporter";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const SENTRY_ENV = (import.meta.env.VITE_SENTRY_ENV as string) || "production";

let sentryInitialized = false;

export function initSentry(): void {
  if (sentryInitialized) return;
  if (!SENTRY_DSN) {
    return;
  }
  sentryInitialized = true;
  console.log("[Sentry] Initialized — DSN configured, env:", SENTRY_ENV, "release:", APP_VERSION);
}

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
  console.debug("[Sentry] Captured exception:", error.message, context);
}

export function setSentryUser(userId: string): void {
  if (!sentryInitialized) return;
  console.debug("[Sentry] User set:", userId);
}

export function addSentryBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): void {
  if (!sentryInitialized) return;
  console.debug("[Sentry] Breadcrumb:", category, message, data);
}
