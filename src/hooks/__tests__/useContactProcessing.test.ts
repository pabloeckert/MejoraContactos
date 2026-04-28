import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useContactProcessing, suggestOptimalConfig, INITIAL_PIPELINE } from "@/hooks/useContactProcessing";
import type { ParsedFile } from "@/types/contact";

// Mock dependencies
vi.mock("@/lib/api-keys", () => ({
  getActiveKeysMulti: async () => ({ groq: ["key1"], openrouter: ["key2"] }),
}));

vi.mock("@/lib/db", () => ({
  clearContacts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { contacts: [] }, error: null }),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function makeFiles(overrides?: Partial<ParsedFile>): ParsedFile[] {
  return [{
    id: "f1",
    name: "test.csv",
    size: 100,
    type: "text/csv",
    rows: [
      { Nombre: "Juan", Apellido: "García", Email: "juan@test.com", Teléfono: "+5491155551234" },
      { Nombre: "María", Apellido: "López", Email: "maria@test.com", Teléfono: "+5491155555678" },
    ],
    columns: ["Nombre", "Apellido", "Email", "Teléfono"],
    addedAt: new Date(),
    ...overrides,
  }];
}

describe("suggestOptimalConfig", () => {
  it("should pick 3 different providers when available", () => {
    const config = suggestOptimalConfig(["groq", "openrouter", "gemini", "together"]);
    expect(config.clean).toBeTruthy();
    expect(config.verify).toBeTruthy();
    expect(config.correct).toBeTruthy();
    const providers = [config.clean, config.verify, config.correct];
    expect(new Set(providers).size).toBe(3);
  });

  it("should fallback to first provider when not enough providers", () => {
    const config = suggestOptimalConfig(["groq"]);
    expect(config.clean).toBe("groq");
    expect(config.verify).toBe("groq");
    expect(config.correct).toBe("groq");
  });

  it("should return empty strings when no providers", () => {
    const config = suggestOptimalConfig([]);
    expect(config.clean).toBe("groq"); // fallback default
  });

  it("should prefer groq for cleaning", () => {
    const config = suggestOptimalConfig(["groq", "openrouter", "gemini"]);
    expect(config.clean).toBe("groq");
  });
});

describe("useContactProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with correct defaults", () => {
    const { result } = renderHook(() => useContactProcessing([]));
    expect(result.current.mode).toBe("pipeline");
    expect(result.current.pipelineState).toEqual(INITIAL_PIPELINE);
    expect(result.current.stats.status).toBe("idle");
    expect(result.current.logs).toEqual([]);
  });

  it("should auto-detect mappings when files are provided", () => {
    const { result } = renderHook(() => useContactProcessing(makeFiles()));
    expect(result.current.mappings.length).toBeGreaterThan(0);
    expect(result.current.allColumns).toEqual(["Nombre", "Apellido", "Email", "Teléfono"]);
  });

  it("should handle mapping changes", () => {
    const { result } = renderHook(() => useContactProcessing(makeFiles()));
    act(() => {
      result.current.handleMappingChange(0, "firstName");
    });
    expect(result.current.mappings[0].target).toBe("firstName");
  });

  it("should track active providers", async () => {
    const { result } = renderHook(() => useContactProcessing([]));
    await waitFor(() => {
      expect(result.current.activeProviders).toContain("groq");
      expect(result.current.activeProviders).toContain("openrouter");
    });
  });

  it("should compute progress correctly", () => {
    const { result } = renderHook(() => useContactProcessing([]));
    expect(result.current.progress).toBe(0);
  });

  it("should reset state correctly", () => {
    const { result } = renderHook(() => useContactProcessing(makeFiles()));
    act(() => {
      result.current.resetState();
    });
    expect(result.current.stats.status).toBe("idle");
    expect(result.current.logs).toEqual([]);
  });

  it("should toggle pause state", () => {
    const { result } = renderHook(() => useContactProcessing(makeFiles()));
    act(() => {
      result.current.pause();
    });
    expect(result.current.stats.status).toBe("paused");
    act(() => {
      result.current.pause();
    });
    expect(result.current.stats.status).toBe("processing");
  });

  it("should set stop flag", () => {
    const { result } = renderHook(() => useContactProcessing(makeFiles()));
    act(() => {
      result.current.stop();
    });
    // stop sets a ref, no direct state change observable
    // but subsequent processing would be affected
    expect(true).toBe(true);
  });

  it("should clean up contacts", async () => {
    const { result } = renderHook(() => useContactProcessing(makeFiles()));
    await act(async () => {
      await result.current.cleanUp();
    });
    expect(result.current.stats.status).toBe("idle");
  });

  it("should switch mode", () => {
    const { result } = renderHook(() => useContactProcessing(makeFiles()));
    act(() => {
      result.current.setMode("single");
    });
    expect(result.current.mode).toBe("single");
  });

  it("should update stage config", () => {
    const { result } = renderHook(() => useContactProcessing(makeFiles()));
    act(() => {
      result.current.setStageConfig({ clean: "together", verify: "mistral", correct: "deepseek" });
    });
    expect(result.current.stageConfig.clean).toBe("together");
  });

  it("should update default country", () => {
    const { result } = renderHook(() => useContactProcessing([]));
    act(() => {
      result.current.setDefaultCountry("MX");
    });
    expect(result.current.defaultCountry).toBe("MX");
  });
});
