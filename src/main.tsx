import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initErrorReporting } from "./lib/error-reporter";
import { cleanupOldHistory } from "./lib/db";

// Lazy-load Sentry after app renders (avoids blocking initial paint with ~186KB @sentry/react)
// initSentry() is called async so the main bundle doesn't include @sentry/react
import("./lib/sentry")
  .then(({ initSentry }) => initSentry())
  .catch(() => {
    // Sentry module failed to load — non-critical, fallback error reporting handles it
  });

// Initialize fallback error reporting (no-op if Sentry is active)
initErrorReporting();

// Inject Plausible analytics script if configured (GDPR-safe, no cookies)
const PLAUSIBLE_DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined;
if (PLAUSIBLE_DOMAIN) {
  const PLAUSIBLE_URL = (import.meta.env.VITE_PLAUSIBLE_URL as string) || "https://plausible.io";
  const script = document.createElement("script");
  script.defer = true;
  script.dataset.domain = PLAUSIBLE_DOMAIN;
  script.src = `${PLAUSIBLE_URL}/js/script.tagged-events.js`;
  document.head.appendChild(script);
}

// Cleanup history entries older than 30 days (fire-and-forget)
cleanupOldHistory().catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);

// Register Service Worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}
