/**
 * Error reporting utility.
 * Currently logs to console. Can be swapped for Sentry/LogRocket later.
 *
 * To enable Sentry:
 * 1. npm install @sentry/react
 * 2. Add SENTRY_DSN to .env
 * 3. Uncomment Sentry.init() in main.tsx
 * 4. Replace captureError() with Sentry.captureException()
 */

interface ErrorContext {
  component?: string;
  action?: string;
  extra?: Record<string, unknown>;
}

export function captureError(error: Error, context?: ErrorContext) {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    ...context,
  };

  // Console log (always)
  console.error("[ErrorReporter]", errorInfo);

  // Future: Sentry.captureException(error, { extra: context });
  // Future: POST to /api/errors endpoint

  // Store last 10 errors in sessionStorage for debugging
  try {
    const key = "__mc_errors__";
    const existing: unknown[] = JSON.parse(sessionStorage.getItem(key) || "[]");
    existing.push(errorInfo);
    if (existing.length > 10) existing.shift();
    sessionStorage.setItem(key, JSON.stringify(existing));
  } catch {
    // sessionStorage full or unavailable — ignore
  }
}

export function getRecentErrors(): unknown[] {
  try {
    return JSON.parse(sessionStorage.getItem("__mc_errors__") || "[]");
  } catch {
    return [];
  }
}
