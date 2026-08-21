import { useSyncExternalStore } from "react";

/**
 * Modo demostración como estado reactivo (Fase 7 de MejoraSuite). Copia
 * deliberada del mismo archivo en MejoraCRM — cada producto de la suite
 * sigue siendo independiente (ver mejorasuite/DECISIONES.md), pero comparten
 * la misma clave de localStorage y el mismo query param `?demo=` para que
 * el toggle "maestro" del launcher de MejoraSuite pueda prender/apagar las
 * tres herramientas a la vez sin que ninguna dependa de código de la otra.
 *
 * Acá no hay Supabase ni backend propio — "modo demo" solo decide si
 * Index.tsx precarga un lote de contactos ficticios en memoria para poder
 * recorrer dedup/limpieza/exportación sin subir un archivo real.
 */
const STORAGE_KEY = "mejorasuite_demo_mode";

function readUrlOverride(): boolean | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("demo")) return null;
  const value = params.get("demo") === "true";
  params.delete("demo");
  const rest = params.toString();
  const cleanUrl = window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash;
  window.history.replaceState(null, "", cleanUrl);
  return value;
}

function readInitial(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === "true";
  } catch {
    // localStorage no disponible (tests, SSR) — sigue al default
  }
  // Por defecto: modo demo ACTIVO, para que una instalación nueva muestre
  // contactos de ejemplo en vez de una pantalla vacía.
  return true;
}

let current = readUrlOverride() ?? readInitial();
if (typeof window !== "undefined") {
  try {
    localStorage.setItem(STORAGE_KEY, String(current));
  } catch {
    // no persiste, pero el estado en memoria de esta pestaña sigue andando
  }
}

const listeners = new Set<() => void>();

export function getDemoMode(): boolean {
  return current;
}

export function setDemoMode(value: boolean): void {
  if (value === current) return;
  current = value;
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // no persiste, pero el estado en memoria de esta pestaña sigue andando
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || e.newValue === null) return;
    const next = e.newValue === "true";
    if (next !== current) {
      current = next;
      listeners.forEach((listener) => listener());
    }
  });
}

export { subscribe as subscribeDemoMode };

/** Hook reactivo — re-renderiza el componente llamante cuando cambia el modo demo. */
export function useDemoMode(): boolean {
  return useSyncExternalStore(subscribe, getDemoMode);
}
