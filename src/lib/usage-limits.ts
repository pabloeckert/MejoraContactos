/**
 * Usage limiter — Free tier enforcement.
 * Tracks batch count per day and contact count per batch.
 *
 * Free: 500 contacts/batch, 3 batches/day
 * Pro:  10,000 contacts/batch, unlimited batches/day (any configured API key → auto-pro)
 *
 * All data stored in localStorage (privacy-first, no server tracking).
 */

export type Tier = "free" | "pro";

interface UsageRecord {
  date: string; // YYYY-MM-DD
  batchCount: number;
}

const TIER_KEY = "__mc_tier__";
const USAGE_KEY = "__mc_usage__";

const LIMITS: Record<Tier, { maxContactsPerBatch: number; maxBatchesPerDay: number }> = {
  free: { maxContactsPerBatch: 500, maxBatchesPerDay: 3 },
  pro: { maxContactsPerBatch: 10_000, maxBatchesPerDay: Infinity },
};

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getUsage(): UsageRecord {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return { date: getToday(), batchCount: 0 };
    const parsed = JSON.parse(raw) as UsageRecord;
    if (parsed.date !== getToday()) return { date: getToday(), batchCount: 0 };
    return parsed;
  } catch {
    return { date: getToday(), batchCount: 0 };
  }
}

function saveUsage(usage: UsageRecord): void {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
    // localStorage full — ignore
  }
}

/** Returns true if the user has at least one working API key configured. */
export function hasOwnApiKeys(): boolean {
  try {
    const raw = localStorage.getItem("mejoraapp_api_keys_v2");
    if (!raw) return false;
    const data = JSON.parse(raw) as Array<{ keys?: Array<{ apiKey?: string; status?: string }> }>;
    if (!Array.isArray(data)) return false;
    return data.some((pk) => pk.keys?.some((k) => k.apiKey && k.status !== "error"));
  } catch {
    return false;
  }
}

/**
 * Returns the effective tier. Users with their own API keys are always "pro"
 * regardless of the stored tier flag.
 */
export function getTier(): Tier {
  if (hasOwnApiKeys()) return "pro";
  try {
    const t = localStorage.getItem(TIER_KEY);
    return t === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}

export function setTier(tier: Tier): void {
  try {
    localStorage.setItem(TIER_KEY, tier);
  } catch {
    // ignore
  }
}

export function getLimits() {
  return LIMITS[getTier()];
}

export function getRemainingBatches(): number {
  const tier = getTier();
  const usage = getUsage();
  if (tier === "pro") return Infinity;
  return Math.max(0, LIMITS.free.maxBatchesPerDay - usage.batchCount);
}

export function getUsageStats() {
  const tier = getTier();
  const usage = getUsage();
  const limits = LIMITS[tier];
  const remaining = tier === "pro" ? Infinity : Math.max(0, limits.maxBatchesPerDay - usage.batchCount);
  return {
    tier,
    isFreeTier: tier === "free",
    batchesUsedToday: usage.batchCount,
    batchesUsed: usage.batchCount,
    maxBatchesPerDay: limits.maxBatchesPerDay,
    maxContactsPerBatch: limits.maxContactsPerBatch,
    maxBatchSize: limits.maxContactsPerBatch,
    remainingBatches: remaining,
    batchesRemaining: remaining,
  };
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  suggestion?: string;
}

export function checkContactLimit(contactCount: number): LimitCheckResult {
  const limits = getLimits();
  if (contactCount > limits.maxContactsPerBatch) {
    const isFree = getTier() === "free";
    return {
      allowed: false,
      reason: `Límite alcanzado: máximo ${limits.maxContactsPerBatch.toLocaleString()} contactos por lote en plan ${isFree ? "Free" : "Pro"}. Tenés ${contactCount.toLocaleString()} contactos.`,
      suggestion: isFree ? "Dividí el archivo o agregá tus propias API keys para eliminar el límite." : undefined,
    };
  }
  return { allowed: true };
}

export function checkBatchLimit(): LimitCheckResult {
  const tier = getTier();
  const usage = getUsage();
  const limits = LIMITS[tier];

  if (usage.batchCount >= limits.maxBatchesPerDay) {
    return {
      allowed: false,
      reason: `Límite diario alcanzado: ${limits.maxBatchesPerDay} lotes por día en plan Free. Intentá mañana o agregá tus API keys para lotes ilimitados.`,
    };
  }
  return { allowed: true };
}

/**
 * Pre-check: can the user process `contactCount` contacts?
 * Combines contact limit + batch limit checks.
 */
export function canProcess(contactCount: number): LimitCheckResult {
  const contactCheck = checkContactLimit(contactCount);
  if (!contactCheck.allowed) return contactCheck;
  return checkBatchLimit();
}

export function recordBatch(): void {
  const usage = getUsage();
  usage.batchCount += 1;
  saveUsage(usage);
}
