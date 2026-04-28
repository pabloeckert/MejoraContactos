/**
 * Gestión de API keys en localStorage con cifrado AES-GCM (Web Crypto API).
 * Separado del componente para evitar warnings de Fast Refresh (HMR).
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
  // Prepend IV (12 bytes) to ciphertext, then base64-encode
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  let binary = "";
  for (const byte of combined) binary += String.fromCharCode(byte);
  return ENC_MARKER + btoa(binary);
}

export async function decryptString(encrypted: string): Promise<string> {
  if (!encrypted.startsWith(ENC_MARKER)) return encrypted; // plain-text fallback
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

// ─── Migration: re-encrypt existing plain-text keys in-place ────────

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
  if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
}

// ─── Public API ─────────────────────────────────────────────────────

export async function loadProviderKeys(): Promise<ProviderKeys[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProviderKeys[];
      // Migrate any remaining plain-text keys (fire-and-forget for next load)
      migrateUnencryptedKeys();
      // Decrypt all keys for in-memory use
      const decrypted: ProviderKeys[] = [];
      for (const pk of parsed) {
        const keys: KeyEntry[] = [];
        for (const k of pk.keys) {
          keys.push({ ...k, apiKey: k.apiKey ? await decryptString(k.apiKey) : k.apiKey });
        }
        decrypted.push({ ...pk, keys });
      }
      return decrypted;
    }
    // Migration from v1 (legacy format)
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as Array<{ providerId: string; apiKey: string; status?: string; lastTested?: string }>;
      const encrypted: ProviderKeys[] = [];
      for (const o of old) {
        encrypted.push({
          providerId: o.providerId,
          keys: [{
            id: crypto.randomUUID(),
            apiKey: await encryptString(o.apiKey),
            status: (o.status as KeyEntry["status"]) || "untested",
            lastTested: o.lastTested,
          }],
        });
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
      // Return decrypted for in-memory use
      return old.map(o => ({
        providerId: o.providerId,
        keys: [{
          id: crypto.randomUUID(),
          apiKey: o.apiKey,
          status: (o.status as KeyEntry["status"]) || "untested",
          lastTested: o.lastTested,
        }],
      }));
    }
    return [];
  } catch { return []; }
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
}

/**
 * Returns active keys grouped per provider (array of keys for rotation).
 */
export async function getActiveKeysMulti(): Promise<Record<string, string[]>> {
  const all = await loadProviderKeys();
  const result: Record<string, string[]> = {};
  for (const pk of all) {
    const valid = pk.keys.filter(k => k.apiKey && k.status !== "error").map(k => k.apiKey);
    if (valid.length > 0) result[pk.providerId] = valid;
  }
  return result;
}

/** Legacy single-key API kept for backward compatibility */
export async function getActiveKeys(): Promise<Record<string, string>> {
  const multi = await getActiveKeysMulti();
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(multi)) flat[k] = v[0];
  return flat;
}
