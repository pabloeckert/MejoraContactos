import { describe, it, expect, beforeEach } from "vitest";
import {
  getTier,
  setTier,
  getLimits,
  getRemainingBatches,
  getUsageStats,
  checkContactLimit,
  checkBatchLimit,
  recordBatch,
} from "../usage-limits";

describe("Usage Limits", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("Tier management", () => {
    it("defaults to free tier", () => {
      expect(getTier()).toBe("free");
    });

    it("can set pro tier", () => {
      setTier("pro");
      expect(getTier()).toBe("pro");
    });

    it("can switch back to free", () => {
      setTier("pro");
      setTier("free");
      expect(getTier()).toBe("free");
    });
  });

  describe("Limits", () => {
    it("free tier has correct limits", () => {
      const limits = getLimits();
      expect(limits.maxContactsPerBatch).toBe(500);
      expect(limits.maxBatchesPerDay).toBe(3);
    });

    it("pro tier has correct limits", () => {
      setTier("pro");
      const limits = getLimits();
      expect(limits.maxContactsPerBatch).toBe(10_000);
      expect(limits.maxBatchesPerDay).toBe(Infinity);
    });
  });

  describe("Contact limit check", () => {
    it("allows under-limit contacts", () => {
      const result = checkContactLimit(100);
      expect(result.allowed).toBe(true);
    });

    it("allows exactly at limit", () => {
      const result = checkContactLimit(500);
      expect(result.allowed).toBe(true);
    });

    it("blocks over-limit contacts", () => {
      const result = checkContactLimit(501);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("500");
    });

    it("pro tier allows more contacts", () => {
      setTier("pro");
      const result = checkContactLimit(5000);
      expect(result.allowed).toBe(true);
    });

    it("pro tier blocks over limit", () => {
      setTier("pro");
      const result = checkContactLimit(10_001);
      expect(result.allowed).toBe(false);
    });
  });

  describe("Batch limit check", () => {
    it("allows first batch", () => {
      const result = checkBatchLimit();
      expect(result.allowed).toBe(true);
    });

    it("blocks after 3 batches", () => {
      recordBatch();
      recordBatch();
      recordBatch();
      const result = checkBatchLimit();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("3 lotes");
    });

    it("pro tier allows unlimited batches", () => {
      setTier("pro");
      for (let i = 0; i < 100; i++) recordBatch();
      const result = checkBatchLimit();
      expect(result.allowed).toBe(true);
    });
  });

  describe("Batch recording", () => {
    it("tracks batch count", () => {
      expect(getUsageStats().batchesUsedToday).toBe(0);
      recordBatch();
      expect(getUsageStats().batchesUsedToday).toBe(1);
      recordBatch();
      expect(getUsageStats().batchesUsedToday).toBe(2);
    });
  });

  describe("Remaining batches", () => {
    it("starts with 3 remaining", () => {
      expect(getRemainingBatches()).toBe(3);
    });

    it("decreases with each batch", () => {
      recordBatch();
      expect(getRemainingBatches()).toBe(2);
    });

    it("returns 0 when exhausted", () => {
      recordBatch();
      recordBatch();
      recordBatch();
      expect(getRemainingBatches()).toBe(0);
    });
  });

  describe("Usage stats", () => {
    it("returns complete stats for free", () => {
      const stats = getUsageStats();
      expect(stats.tier).toBe("free");
      expect(stats.batchesUsedToday).toBe(0);
      expect(stats.maxBatchesPerDay).toBe(3);
      expect(stats.maxContactsPerBatch).toBe(500);
      expect(stats.remainingBatches).toBe(3);
    });

    it("returns complete stats for pro", () => {
      setTier("pro");
      const stats = getUsageStats();
      expect(stats.tier).toBe("pro");
      expect(stats.maxBatchesPerDay).toBe(Infinity);
      expect(stats.maxContactsPerBatch).toBe(10_000);
      expect(stats.remainingBatches).toBe(Infinity);
    });
  });
});
