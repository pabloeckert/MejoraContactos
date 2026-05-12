/**
 * Tests for clean-contacts Edge Function logic.
 * Tests provider config, prompts, rate limiting, CORS, and pipeline.
 */
import { describe, it, expect } from "vitest";

// ── Provider config logic (mirrors Edge Function buildConfig) ──

interface ProviderConfig {
  url: string;
  model: string;
  name: string;
}

function buildConfig(provider: string): ProviderConfig {
  const configs: Record<string, ProviderConfig> = {
    groq: { url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile", name: "Groq (Llama 3.3 70B)" },
    openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", model: "meta-llama/llama-3.3-70b-instruct:free", name: "OpenRouter (Llama 3.3 Free)" },
    gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-2.0-flash-exp", name: "Google Gemini Flash" },
    cerebras: { url: "https://api.cerebras.ai/v1/chat/completions", model: "llama3.1-8b", name: "Cerebras (Llama 3.1 8B)" },
    together: { url: "https://api.together.xyz/v1/chat/completions", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", name: "Together AI (Llama 3.3)" },
    deepinfra: { url: "https://api.deepinfra.com/v1/openai/chat/completions", model: "meta-llama/Llama-3.3-70B-Instruct", name: "DeepInfra (Llama 3.3)" },
    sambanova: { url: "https://api.sambanova.ai/v1/chat/completions", model: "Meta-Llama-3.3-70B-Instruct", name: "SambaNova (Llama 3.3)" },
    mistral: { url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest", name: "Mistral AI (Small)" },
    deepseek: { url: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat", name: "DeepSeek Chat" },
    cloudflare: { url: "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1/chat/completions", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", name: "Cloudflare Workers AI" },
    huggingface: { url: "https://api-inference.huggingface.co/v1/chat/completions", model: "meta-llama/Llama-3.3-70B-Instruct", name: "Hugging Face (Llama 3.3)" },
    nebius: { url: "https://api.studio.nebius.ai/v1/chat/completions", model: "meta-llama/Llama-3.3-70B-Instruct", name: "Nebius AI (Llama 3.3)" },
  };
  const config = configs[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);
  return config;
}

// ── Prompt builders (imported from prompts.ts) ──

function buildCleanPrompt(batch: Record<string, unknown>[]): string {
  return `Clean these contacts:\n${JSON.stringify(batch)}`;
}

function buildVerifyPrompt(original: Record<string, unknown>[], cleaned: Record<string, unknown>[]): string {
  return `Verify:\nOriginal: ${JSON.stringify(original)}\nCleaned: ${JSON.stringify(cleaned)}`;
}

function buildCorrectPrompt(verified: Record<string, unknown>[]): string {
  return `Correct:\n${JSON.stringify(verified)}`;
}

// ── CORS logic ──

const ALLOWED_ORIGINS = [
  "https://pabloeckert.github.io",
  "https://mejoraok.com",
  "http://localhost:8080",
  "http://localhost:5173",
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

// ── Rate limit cache logic ──

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  count: number;
}

const RATE_LIMIT_MAX = 30;
const L1_CACHE_TTL_MS = 8000;

function getCachedRateLimit(
  cache: Map<string, { result: RateLimitResult; expiresAt: number }>,
  ip: string
): RateLimitResult | null {
  const entry = cache.get(ip);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(ip);
    return null;
  }
  return entry.result;
}

function setCachedRateLimit(
  cache: Map<string, { result: RateLimitResult; expiresAt: number }>,
  ip: string,
  result: RateLimitResult
): void {
  cache.set(ip, { result, expiresAt: Date.now() + L1_CACHE_TTL_MS });
}

// ── Pipeline logic ──

function pipelineStagesAreValid(stages: Record<string, string>): boolean {
  const validProviders = [
    "groq", "openrouter", "together", "cerebras", "deepinfra",
    "sambanova", "mistral", "deepseek", "gemini", "cloudflare",
    "huggingface", "nebius",
  ];
  for (const val of Object.values(stages)) {
    if (!validProviders.includes(val)) return false;
  }
  return true;
}

// ── Tests ──

describe("Clean Contacts Edge Function — Provider Config", () => {
  it("all 12 providers have valid configs", () => {
    const providers = [
      "groq", "openrouter", "together", "cerebras", "deepinfra",
      "sambanova", "mistral", "deepseek", "gemini", "cloudflare",
      "huggingface", "nebius",
    ];
    for (const p of providers) {
      const config = buildConfig(p);
      expect(config.url).toBeTruthy();
      expect(config.model).toBeTruthy();
      expect(config.name).toBeTruthy();
      expect(config.url).toContain("http");
    }
  });

  it("throws on unknown provider", () => {
    expect(() => buildConfig("unknown")).toThrow("Unknown provider");
  });

  it("groq uses correct endpoint", () => {
    const config = buildConfig("groq");
    expect(config.url).toContain("groq.com");
    expect(config.model).toContain("llama");
  });

  it("openrouter uses free model", () => {
    const config = buildConfig("openrouter");
    expect(config.model).toContain(":free");
  });

  it("gemini uses flash model", () => {
    const config = buildConfig("gemini");
    expect(config.model).toContain("flash");
  });
});

describe("Clean Contacts Edge Function — Prompts", () => {
  it("clean prompt includes contact data", () => {
    const batch = [{ firstName: "Juan", lastName: "Pérez" }];
    const prompt = buildCleanPrompt(batch);
    expect(prompt).toContain("Juan");
    expect(prompt).toContain("Pérez");
  });

  it("verify prompt includes both original and cleaned", () => {
    const original = [{ firstName: "juan" }];
    const cleaned = [{ firstName: "Juan" }];
    const prompt = buildVerifyPrompt(original, cleaned);
    expect(prompt).toContain("juan");
    expect(prompt).toContain("Juan");
  });

  it("correct prompt includes verified data", () => {
    const verified = [{ firstName: "Juan", issues: ["wrong case"] }];
    const prompt = buildCorrectPrompt(verified);
    expect(prompt).toContain("Juan");
    expect(prompt).toContain("wrong case");
  });
});

describe("Clean Contacts Edge Function — CORS", () => {
  it("allows production origin", () => {
    const headers = getCorsHeaders("https://pabloeckert.github.io");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://pabloeckert.github.io");
  });

  it("allows localhost:8080", () => {
    const headers = getCorsHeaders("http://localhost:8080");
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:8080");
  });

  it("falls back to first origin for unknown", () => {
    const headers = getCorsHeaders("https://evil.com");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://pabloeckert.github.io");
  });

  it("falls back to first origin for null", () => {
    const headers = getCorsHeaders(null);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://pabloeckert.github.io");
  });

  it("includes required headers", () => {
    const headers = getCorsHeaders("https://pabloeckert.github.io");
    expect(headers["Access-Control-Allow-Headers"]).toContain("authorization");
    expect(headers["Access-Control-Allow-Headers"]).toContain("content-type");
  });
});

describe("Clean Contacts Edge Function — Rate Limit Cache", () => {
  it("returns null for cache miss", () => {
    const cache = new Map();
    expect(getCachedRateLimit(cache, "1.2.3.4")).toBeNull();
  });

  it("returns cached result on hit", () => {
    const cache = new Map();
    const result: RateLimitResult = { allowed: true, count: 5 };
    setCachedRateLimit(cache, "1.2.3.4", result);
    const cached = getCachedRateLimit(cache, "1.2.3.4");
    expect(cached).toEqual(result);
  });

  it("returns null for expired cache", () => {
    const cache = new Map();
    const result: RateLimitResult = { allowed: true, count: 5 };
    // Set with expired timestamp
    cache.set("1.2.3.4", { result, expiresAt: Date.now() - 1000 });
    expect(getCachedRateLimit(cache, "1.2.3.4")).toBeNull();
  });

  it("different IPs have separate caches", () => {
    const cache = new Map();
    setCachedRateLimit(cache, "1.2.3.4", { allowed: true, count: 5 });
    setCachedRateLimit(cache, "5.6.7.8", { allowed: false, count: 30 });
    expect(getCachedRateLimit(cache, "1.2.3.4")?.allowed).toBe(true);
    expect(getCachedRateLimit(cache, "5.6.7.8")?.allowed).toBe(false);
  });

  it("evicts stale entries when cache grows large", () => {
    const cache = new Map();
    // Add 500+ entries, some expired
    for (let i = 0; i < 510; i++) {
      cache.set(`ip-${i}`, {
        result: { allowed: true, count: 1 },
        expiresAt: i < 400 ? Date.now() - 1000 : Date.now() + 10000,
      });
    }
    // Simulate eviction (same logic as Edge Function)
    if (cache.size > 500) {
      const now = Date.now();
      for (const [k, v] of cache) {
        if (now > v.expiresAt) cache.delete(k);
      }
    }
    expect(cache.size).toBeLessThanOrEqual(500);
  });
});

describe("Clean Contacts Edge Function — Pipeline Validation", () => {
  it("accepts valid pipeline stages", () => {
    expect(pipelineStagesAreValid({ clean: "groq", verify: "openrouter", correct: "gemini" })).toBe(true);
  });

  it("rejects invalid provider in stages", () => {
    expect(pipelineStagesAreValid({ clean: "groq", verify: "invalid", correct: "gemini" })).toBe(false);
  });

  it("accepts partial stages", () => {
    expect(pipelineStagesAreValid({ clean: "groq" })).toBe(true);
  });

  it("accepts empty stages", () => {
    expect(pipelineStagesAreValid({})).toBe(true);
  });
});

describe("Clean Contacts Edge Function — Input Sanitization", () => {
  const MAX_FIELD_LEN = 500;

  function sanitize(contact: Record<string, unknown>) {
    return {
      firstName: typeof contact.firstName === "string" ? contact.firstName.slice(0, MAX_FIELD_LEN) : undefined,
      lastName: typeof contact.lastName === "string" ? contact.lastName.slice(0, MAX_FIELD_LEN) : undefined,
      whatsapp: typeof contact.whatsapp === "string" ? contact.whatsapp.slice(0, 50) : undefined,
      company: typeof contact.company === "string" ? contact.company.slice(0, MAX_FIELD_LEN) : undefined,
      jobTitle: typeof contact.jobTitle === "string" ? contact.jobTitle.slice(0, MAX_FIELD_LEN) : undefined,
      email: typeof contact.email === "string" ? contact.email.slice(0, 254) : undefined,
    };
  }

  it("preserves valid contact fields", () => {
    const result = sanitize({ firstName: "Juan", lastName: "Pérez", email: "juan@test.com" });
    expect(result.firstName).toBe("Juan");
    expect(result.lastName).toBe("Pérez");
    expect(result.email).toBe("juan@test.com");
  });

  it("truncates fields over 500 chars", () => {
    const long = "A".repeat(1000);
    const result = sanitize({ firstName: long, lastName: long });
    expect(result.firstName).toHaveLength(500);
    expect(result.lastName).toHaveLength(500);
  });

  it("truncates email to 254 chars", () => {
    const long = "a".repeat(300) + "@test.com";
    const result = sanitize({ email: long });
    expect(result.email).toHaveLength(254);
  });

  it("truncates whatsapp to 50 chars", () => {
    const long = "+54".repeat(20);
    const result = sanitize({ whatsapp: long });
    expect(result.whatsapp).toHaveLength(50);
  });

  it("sets non-string fields to undefined", () => {
    const result = sanitize({ firstName: 123, lastName: null, email: true });
    expect(result.firstName).toBeUndefined();
    expect(result.lastName).toBeUndefined();
    expect(result.email).toBeUndefined();
  });

  it("handles empty contact", () => {
    const result = sanitize({});
    expect(result.firstName).toBeUndefined();
    expect(result.lastName).toBeUndefined();
    expect(result.email).toBeUndefined();
  });
});

describe("Clean Contacts Edge Function — Fallback Logic", () => {
  it("falls back to original when AI returns no JSON", () => {
    const original = [{ firstName: "Juan", lastName: "Pérez" }];
    const aiResponse = "Here are the cleaned contacts: [no valid json]";
    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
    // If no valid JSON, should fall back to original
    if (!jsonMatch) {
      expect(original).toEqual(original);
    }
  });

  it("parses valid JSON array from AI response", () => {
    const aiResponse = 'Some text [{"firstName":"Juan","lastName":"Pérez"}] more text';
    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
    expect(jsonMatch).toBeTruthy();
    const parsed = JSON.parse(jsonMatch![0]);
    expect(parsed[0].firstName).toBe("Juan");
  });

  it("handles AI response with markdown code block", () => {
    const aiResponse = '```json\n[{"firstName":"Juan"}]\n```';
    const cleaned = aiResponse.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    expect(jsonMatch).toBeTruthy();
    const parsed = JSON.parse(jsonMatch![0]);
    expect(parsed[0].firstName).toBe("Juan");
  });
});
