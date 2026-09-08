/**
 * Gestión de API keys en localStorage con cifrado AES-GCM (Web Crypto API).
 * El cifrado es transparente: las funciones públicas mantienen la API sync.
 *
 * Estrategia: cache en memoria inicializado sync desde localStorage.
 * Las keys se almacenan cifradas en localStorage pero se descifran async
 * en background. Mientras tanto, el cache tiene las keys (posiblemente
 * cifradas) que son funcionales para las llamadas inmediatas.
 *
 * Riesgo conocido (hallazgo de la auditoría pre-beta, aceptado a propósito):
 * la clave de cifrado (ENC_KEY_STORAGE) vive en el mismo localStorage que el
 * texto cifrado. Esto protege contra un volcado casual del storage, pero NO
 * contra un XSS o script corriendo en el mismo origen — quien pueda leer
 * localStorage puede descifrar todo. Es la razón por la que las keys nunca
 * salen del navegador del usuario (no viajan a ningún backend de Mejora
 * Continua). Antes de ofrecer sync entre dispositivos o cualquier lugar
 * donde estas keys salgan de este storage, hay que resolver esto de fondo
 * (ej. derivar la clave de un passphrase que el usuario ingresa, no
 * guardarla junto a lo que cifra).
 */

export interface KeyEntry {
  id: string;
  apiKey: string;
  label?: string;
  lastTested?: string;
  status?: "ok" | "error" | "untested";
}

export interface ProviderKeys {
  providerId: string;
  keys: KeyEntry[];
}

const STORAGE_KEY = "mejoraapp_api_keys_v2";
const LEGACY_KEY = "contactunifier_api_keys";
const ENC_KEY_STORAGE = "__mc_enc_key__";
const ENC_MARKER = "__enc__:";

// ─── In-memory cache (sync access) ─────────────────────────────────

let cachedKeys: ProviderKeys[] = [];
let decryptedKeys: ProviderKeys[] = [];
let decryptionDone = false;

/** Initialize cache synchronously from localStorage (may contain encrypted keys). */
function initCacheSync(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cachedKeys = JSON.parse(raw) as ProviderKeys[];
      // If keys look unencrypted, use them directly
      const hasEncrypted = cachedKeys.some(pk => pk.keys.some(k => k.apiKey?.startsWith(ENC_MARKER)));
      if (!hasEncrypted) {
        decryptedKeys = cachedKeys;
        decryptionDone = true;
      }
      return;
    }
    // Legacy migration
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as Array<{ providerId: string; apiKey: string; status?: string; lastTested?: string }>;
      cachedKeys = old.map(o => ({
        providerId: o.providerId,
        keys: [{
          id: crypto.randomUUID(),
          apiKey: o.apiKey,
          status: (o.status as KeyEntry["status"]) || "untested",
          lastTested: o.lastTested,
        }],
      }));
      decryptedKeys = cachedKeys;
      decryptionDone = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedKeys));
    }
  } catch {
    cachedKeys = [];
    decryptedKeys = [];
    decryptionDone = true;
  }
}

// ─── Web Crypto helpers ─────────────────────────────────────────────

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(ENC_KEY_STORAGE);
  if (stored) {
    const jwk = JSON.parse(stored) as JsonWebKey;
    return crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  localStorage.setItem(ENC_KEY_STORAGE, JSON.stringify(jwk));
  return key;
}

export async function encryptString(plain: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  let binary = "";
  for (const byte of combined) binary += String.fromCharCode(byte);
  return ENC_MARKER + btoa(binary);
}

export async function decryptString(encrypted: string): Promise<string> {
  if (!encrypted.startsWith(ENC_MARKER)) return encrypted;
  const b64 = encrypted.slice(ENC_MARKER.length);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const key = await getOrCreateEncryptionKey();
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

// ─── Background decryption ──────────────────────────────────────────

async function decryptAllKeys(): Promise<void> {
  if (decryptionDone) return;
  try {
    const result: ProviderKeys[] = [];
    for (const pk of cachedKeys) {
      const keys: KeyEntry[] = [];
      for (const k of pk.keys) {
        keys.push({ ...k, apiKey: k.apiKey ? await decryptString(k.apiKey) : k.apiKey });
      }
      result.push({ ...pk, keys });
    }
    decryptedKeys = result;
    decryptionDone = true;
  } catch {
    // If decryption fails, use raw keys (better than nothing)
    decryptedKeys = cachedKeys;
    decryptionDone = true;
  }
}

// ─── Migration ──────────────────────────────────────────────────────

async function migrateUnencryptedKeys(): Promise<void> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const data = JSON.parse(raw) as ProviderKeys[];
  let changed = false;
  const migrated: ProviderKeys[] = [];
  for (const pk of data) {
    const keys: KeyEntry[] = [];
    for (const k of pk.keys) {
      if (k.apiKey && !k.apiKey.startsWith(ENC_MARKER)) {
        keys.push({ ...k, apiKey: await encryptString(k.apiKey) });
        changed = true;
      } else {
        keys.push(k);
      }
    }
    migrated.push({ ...pk, keys });
  }
  if (changed) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    cachedKeys = migrated;
  }
}

// ─── Public API (sync) ──────────────────────────────────────────────

// Initialize cache on module load
initCacheSync();
// Start background decryption if needed
if (!decryptionDone) decryptAllKeys().catch(() => {});
// Fire-and-forget migration
if (decryptionDone) migrateUnencryptedKeys().catch(() => {});

/**
 * Returns active keys grouped per provider (array of keys for rotation).
 * Sync function — returns decrypted keys if available, raw keys otherwise.
 */
export function getActiveKeysMulti(): Record<string, string[]> {
  const source = decryptionDone ? decryptedKeys : cachedKeys;
  const result: Record<string, string[]> = {};
  for (const pk of source) {
    const valid = pk.keys.filter(k => k.apiKey && k.status !== "error").map(k => k.apiKey);
    if (valid.length > 0) result[pk.providerId] = valid;
  }
  return result;
}

/** Legacy single-key API */
export function getActiveKeys(): Record<string, string> {
  const multi = getActiveKeysMulti();
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(multi)) flat[k] = v[0];
  return flat;
}

/**
 * Load provider keys (async, waits for full decryption).
 */
export async function loadProviderKeys(): Promise<ProviderKeys[]> {
  if (!decryptionDone) await decryptAllKeys();
  return decryptedKeys;
}

export async function saveProviderKeys(keys: ProviderKeys[]) {
  const encrypted: ProviderKeys[] = [];
  for (const pk of keys) {
    const encKeys: KeyEntry[] = [];
    for (const k of pk.keys) {
      encKeys.push({
        ...k,
        apiKey: k.apiKey ? await encryptString(k.apiKey) : k.apiKey,
      });
    }
    encrypted.push({ ...pk, keys: encKeys });
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
  cachedKeys = encrypted;
  decryptedKeys = keys;
  decryptionDone = true;
}

/**
 * Force-refresh the cache from localStorage.
 */
export async function refreshKeyCache(): Promise<void> {
  decryptionDone = false;
  initCacheSync();
  if (!decryptionDone) await decryptAllKeys();
  await migrateUnencryptedKeys();
}
