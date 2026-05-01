import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleError,
  safeAsync,
  safeSync,
  handleStorageError,
  handleAIError,
  handleParseError,
  toUserMessage,
} from "../error-handler";

// Mock error-reporter
vi.mock("../error-reporter", () => ({
  captureError: vi.fn(),
}));

import { captureError } from "../error-reporter";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleError", () => {
  it("returns a normalized Error object", () => {
    const result = handleError("something broke", {
      component: "test",
      action: "test_action",
    });
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("something broke");
  });

  it("calls captureError with correct context", () => {
    const error = new Error("test error");
    handleError(error, {
      component: "parsers",
      action: "parseCSV",
      category: "parse",
      extra: { fileName: "test.csv" },
    });

    expect(captureError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        component: "parsers",
        action: "parseCSV",
        extra: expect.objectContaining({
          category: "parse",
          fileName: "test.csv",
        }),
      })
    );
  });

  it("uses default severity based on category", () => {
    handleError(new Error("test"), {
      component: "test",
      action: "test",
      category: "pipeline", // high severity
    });

    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ severity: "high" }),
      })
    );
  });

  it("skips captureError for silent + low severity", () => {
    handleError(new Error("quiet"), {
      component: "test",
      action: "test",
      category: "storage",
      severity: "low",
      silent: true,
    });

    expect(captureError).not.toHaveBeenCalled();
  });

  it("captures even silent errors if severity is higher than low", () => {
    handleError(new Error("important"), {
      component: "test",
      action: "test",
      category: "storage",
      severity: "medium",
      silent: true,
    });

    expect(captureError).toHaveBeenCalled();
  });

  it("normalizes non-Error values", () => {
    const result = handleError({ message: "object error" }, {
      component: "test",
      action: "test",
    });
    expect(result.message).toBe("object error");
  });
});

describe("safeAsync", () => {
  it("returns result on success", async () => {
    const result = await safeAsync(
      () => Promise.resolve(42),
      { component: "test", action: "test" },
      0
    );
    expect(result).toBe(42);
  });

  it("returns fallback on error", async () => {
    const result = await safeAsync(
      () => Promise.reject(new Error("fail")),
      { component: "test", action: "test", category: "network" },
      -1
    );
    expect(result).toBe(-1);
  });

  it("calls captureError on failure", async () => {
    await safeAsync(
      () => Promise.reject(new Error("network fail")),
      { component: "api", action: "fetch", category: "network" },
      null
    );

    expect(captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "network fail" }),
      expect.objectContaining({
        component: "api",
        action: "fetch",
      })
    );
  });
});

describe("safeSync", () => {
  it("returns result on success", () => {
    const result = safeSync(
      () => JSON.parse('{"a":1}'),
      { component: "test", action: "test" },
      null
    );
    expect(result).toEqual({ a: 1 });
  });

  it("returns fallback on error", () => {
    const result = safeSync(
      () => JSON.parse("invalid"),
      { component: "test", action: "test", category: "parse" },
      null
    );
    expect(result).toBeNull();
  });

  it("captures parse errors", () => {
    safeSync(
      () => JSON.parse("bad json"),
      { component: "ai-validator", action: "parseResponse", category: "ai" },
      null
    );

    expect(captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("JSON") }),
      expect.objectContaining({ component: "ai-validator" })
    );
  });
});

describe("convenience handlers", () => {
  it("handleStorageError does not capture (silent + low)", () => {
    handleStorageError(new Error("quota"), "usage-limits", "saveUsage");
    expect(captureError).not.toHaveBeenCalled();
  });

  it("handleAIError captures with provider info", () => {
    handleAIError(new Error("rate limit"), "ai-validator", "groq");
    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        component: "ai-validator",
        extra: expect.objectContaining({ provider: "groq" }),
      })
    );
  });

  it("handleParseError captures with file info", () => {
    handleParseError(new Error("bad format"), "contacts.csv", "CSV");
    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        component: "parsers",
        extra: expect.objectContaining({ fileName: "contacts.csv", fileType: "CSV" }),
      })
    );
  });
});

describe("toUserMessage", () => {
  it("strips Error: prefix", () => {
    expect(toUserMessage(new Error("Error: something"))).toBe("something");
  });

  it("strips TypeError: prefix", () => {
    expect(toUserMessage(new Error("TypeError: null is not an object"))).toBe("null is not an object");
  });

  it("truncates long messages", () => {
    const long = "x".repeat(300);
    const result = toUserMessage(new Error(long));
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith("...")).toBe(true);
  });

  it("handles non-Error values", () => {
    expect(toUserMessage("string error")).toBe("string error");
    expect(toUserMessage(null)).toContain("Unknown error");
  });

  it("returns fallback for empty messages", () => {
    expect(toUserMessage(new Error(""))).toBe("Ocurrió un error inesperado");
  });
});
