/**
 * Gestión de API keys en localStorage.
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

export function loadProviderKeys(): ProviderKeys[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProviderKeys[];
    // Migration from v1
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as Array<{ providerId: string; apiKey: string; status?: string; lastTested?: string }>;
      const migrated: ProviderKeys[] = old.map(o => ({
        providerId: o.providerId,
        keys: [{ id: crypto.randomUUID(), apiKey: o.apiKey, status: (o.status as KeyEntry["status"]) || "untested", lastTested: o.lastTested }],
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return [];
  } catch { return []; }
}

export function saveProviderKeys(keys: ProviderKeys[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

/**
 * Returns active keys grouped per provider (array of keys for rotation).
 */
export function getActiveKeysMulti(): Record<string, string[]> {
  const all = loadProviderKeys();
  const result: Record<string, string[]> = {};
  for (const pk of all) {
    const valid = pk.keys.filter(k => k.apiKey && k.status !== "error").map(k => k.apiKey);
    if (valid.length > 0) result[pk.providerId] = valid;
  }
  return result;
}

/** Legacy single-key API kept for backward compatibility */
export function getActiveKeys(): Record<string, string> {
  const multi = getActiveKeysMulti();
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(multi)) flat[k] = v[0];
  return flat;
}
