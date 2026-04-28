/**
 * Lightweight analytics — no external dependencies.
 * Stores events in localStorage. Integrates with Plausible when configured.
 *
 * To enable Plausible:
 * 1. Set VITE_PLAUSIBLE_DOMAIN env var (e.g. "util.mejoraok.com")
 * 2. Optionally set VITE_PLAUSIBLE_URL if self-hosted (default: https://plausible.io)
 *
 * Plausible is GDPR-compliant, no cookies, no personal data.
 */

interface AnalyticsEvent {
  name: string;
  props?: Record<string, string | number>;
  timestamp: number;
}

const STORAGE_KEY = "__mc_analytics__";
const MAX_EVENTS = 500;

// ─── Plausible integration ──────────────────────────────────────────

const PLAUSIBLE_DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined;
const PLAUSIBLE_URL = (import.meta.env.VITE_PLAUSIBLE_URL as string) || "https://plausible.io";

function plausibleTrack(name: string, props?: Record<string, string | number>): void {
  if (!PLAUSIBLE_DOMAIN) return;
  try {
    const body = JSON.stringify({
      name,
      url: window.location.href,
      domain: PLAUSIBLE_DOMAIN,
      props: props || {},
    });
    // Use sendBeacon for non-blocking (survives page unload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${PLAUSIBLE_URL}/api/event`, new Blob([body], { type: "application/json" }));
    } else {
      fetch(`${PLAUSIBLE_URL}/api/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Silent fail — analytics should never break the app
  }
}

// ─── Local storage ──────────────────────────────────────────────────

function getEvents(): AnalyticsEvent[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveEvents(events: AnalyticsEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-50)));
  }
}

// ─── Core tracking ──────────────────────────────────────────────────

export function trackEvent(name: string, props?: Record<string, string | number>) {
  const event: AnalyticsEvent = { name, props, timestamp: Date.now() };
  const events = getEvents();
  events.push(event);
  saveEvents(events);

  if (import.meta.env.DEV) {
    console.log(`[Analytics] ${name}`, props || "");
  }

  // Send to Plausible if configured
  plausibleTrack(name, props);
}

// ─── Funnel events ──────────────────────────────────────────────────
// Funnel: visit → import → map → clean → export

export const analytics = {
  // ── Visit (page load) ──
  pageView: (page?: string) => trackEvent("page_view", { page: page || window.location.pathname }),

  // ── Onboarding ──
  wizardStarted: () => trackEvent("wizard_started"),
  wizardStep: (step: number) => trackEvent("wizard_step", { step }),
  wizardCompleted: () => trackEvent("wizard_completed"),
  wizardSkipped: () => trackEvent("wizard_skipped"),

  // ── Import (funnel step 1) ──
  fileImported: (format: string, rows: number) => trackEvent("file_imported", { format, rows }),
  googleContactsImported: (count: number) => trackEvent("google_contacts_imported", { count }),

  // ── Mapping (funnel step 2) ──
  columnsMapped: (mapped: number, total: number) => trackEvent("columns_mapped", { mapped, total }),

  // ── Processing (funnel step 3) ──
  processingStarted: (provider: string, contactCount: number) =>
    trackEvent("processing_started", { provider, contactCount }),
  processingCompleted: (provider: string, durationMs: number, cleaned: number, duplicates: number) =>
    trackEvent("processing_completed", { provider, durationMs, cleaned, duplicates }),
  processingFailed: (provider: string, error: string) =>
    trackEvent("processing_failed", { provider, error: error.slice(0, 100) }),

  // ── Export (funnel step 4) ──
  exportStarted: (format: string) => trackEvent("export_started", { format }),
  exportCompleted: (format: string, count: number) => trackEvent("export_completed", { format, count }),

  // ── Settings ──
  apiKeyAdded: (provider: string) => trackEvent("api_key_added", { provider }),
  healthCheckRun: (providerCount: number) => trackEvent("health_check_run", { providerCount }),

  // ── Undo ──
  undoPerformed: (snapshotAge: string) => trackEvent("undo_performed", { snapshotAge }),

  // ── Mode ──
  simpleModeToggled: (enabled: boolean) => trackEvent("simple_mode_toggled", { enabled: enabled ? 1 : 0 }),

  // ── Funnel stats ──
  getFunnelStats: (): { step: string; count: number }[] => {
    const events = getEvents();
    const funnelSteps = ["page_view", "file_imported", "columns_mapped", "processing_started", "processing_completed", "export_completed"];
    return funnelSteps.map((step) => ({
      step,
      count: events.filter((e) => e.name === step).length,
    }));
  },

  // ── General stats ──
  getStats: () => {
    const events = getEvents();
    return {
      totalEvents: events.length,
      firstSeen: events[0]?.timestamp || null,
      lastSeen: events[events.length - 1]?.timestamp || null,
      eventCounts: events.reduce((acc, e) => {
        acc[e.name] = (acc[e.name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  },
};
