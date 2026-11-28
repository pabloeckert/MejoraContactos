import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useContactProcessing, INITIAL_PIPELINE } from "@/hooks/useContactProcessing";
import type { ParsedFile } from "@/types/contact";

vi.mock("@/lib/db", () => ({
  clearContacts: vi.fn().mockResolvedValue(undefined),
  saveHistorySnapshot: vi.fn().mockResolvedValue(undefined),
  getAllContacts: vi.fn().mockResolvedValue([]),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function makeFiles(overrides?: Partial<ParsedFile>): ParsedFile[] {
  return [
    {
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
    },
  ];
}

describe("useContactProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with correct local defaults", () => {
    const { result } = renderHook(() => useContactProcessing([]));
    expect(result.current.defaultCountry).toBe("AR");
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
    expect(result.current.logs.every((l) => l.type === "info")).toBe(true);
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

  it("should clean up contacts", async () => {
    const { result } = renderHook(() => useContactProcessing(makeFiles()));
    await act(async () => {
      await result.current.cleanUp();
    });
    expect(result.current.stats.status).toBe("idle");
  });

  it("should update default country", () => {
    const { result } = renderHook(() => useContactProcessing([]));
    act(() => {
      result.current.setDefaultCountry("MX");
    });
    expect(result.current.defaultCountry).toBe("MX");
  });
});
