import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initErrorReporting } from "./lib/error-reporter";
import { cleanupOldHistory } from "./lib/db";

initErrorReporting();
cleanupOldHistory().catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);

// Register Service Worker for offline PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}
