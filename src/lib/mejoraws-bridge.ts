/**
 * Cliente del bridge local de MejoraWS (Fase 3 de MejoraSuite). MejoraWS es
 * una app de escritorio Electron aparte — esto es solo el cliente HTTP que
 * le habla al servidor que ella expone en 127.0.0.1:4180 (ver
 * MejoraWS/electron/bridge.mjs).
 *
 * El token de conexión se pega a mano una vez (se copia desde la propia UI
 * de MejoraWS, botón "Copiar token de conexión") y se guarda cifrado en
 * localStorage con el mismo mecanismo AES-GCM que ya usa este repo para las
 * API keys de IA — ver encryptString/decryptString en api-keys.ts. No hay
 * forma de que esta app web lea el archivo bridge-token.txt del disco
 * directamente (no tiene acceso a filesystem), por eso el paso manual.
 */

import { encryptString, decryptString } from "./api-keys";

const BRIDGE_URL = "http://127.0.0.1:4180";
const TOKEN_STORAGE_KEY = "mejoraws_bridge_token_v1";
const FETCH_TIMEOUT_MS = 2500;

export interface BridgeStatus {
  connected: boolean;
  waStatus: string;
  campaignRunning: boolean;
  stopRequested: boolean;
  pauseRequested: boolean;
}

export async function saveBridgeToken(token: string): Promise<void> {
  const encrypted = await encryptString(token.trim());
  localStorage.setItem(TOKEN_STORAGE_KEY, encrypted);
}

export async function loadBridgeToken(): Promise<string | null> {
  const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    return await decryptString(raw);
  } catch {
    return null;
  }
}

export function clearBridgeToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(id) };
}

/**
 * Devuelve el estado o `null` si MejoraWS no está corriendo / no responde
 * (nunca tira excepción — el llamador solo necesita distinguir "conectado
 * con estado X" de "no disponible ahora").
 */
export async function getBridgeStatus(token: string): Promise<BridgeStatus | null> {
  const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BRIDGE_URL}/status`, {
      headers: { "X-Bridge-Token": token },
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as BridgeStatus;
  } catch {
    return null;
  } finally {
    cancel();
  }
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

/**
 * Dispara un envío de WhatsApp a un contacto vía el bridge de MejoraWS
 * (Fase 6 de MejoraSuite). MejoraContactos no comparte datos con MejoraWS,
 * así que del lado de MejoraWS esto da de alta al contacto en una carpeta
 * dedicada ("Importados desde MejoraContactos") si hace falta, y usa el
 * mismo `runCampaign` de siempre — no hay lógica de envío nueva ni acá ni
 * del otro lado. Nunca tira excepción: siempre devuelve `{ ok, error? }`.
 */
export async function sendViaWhatsApp(token: string, telefono: string, nombre: string): Promise<SendResult> {
  const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BRIDGE_URL}/add-and-send`, {
      method: "POST",
      headers: { "X-Bridge-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ telefono, nombre }),
      signal,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error || "MejoraWS no respondió el envío" };
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar con MejoraWS — ¿está abierto?" };
  } finally {
    cancel();
  }
}

/** Link mejoraws:// para ofrecer "Abrir MejoraWS" cuando el bridge no responde. */
export const MEJORAWS_PROTOCOL_URL = "mejoraws://open";
