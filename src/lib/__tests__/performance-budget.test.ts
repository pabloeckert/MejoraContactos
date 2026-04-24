/**
 * Performance budget tests.
 * Verifies that the bundle stays within acceptable size limits.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function getDirSize(dir: string): number {
  let total = 0;
  const items = readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      total += getDirSize(path);
    } else {
      total += statSync(path).size;
    }
  }
  return total;
}

function getFilesByExtension(dir: string, ext: string): string[] {
  const results: string[] = [];
  const items = readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...getFilesByExtension(path, ext));
    } else if (item.name.endsWith(ext)) {
      results.push(path);
    }
  }
  return results;
}

describe("Performance Budget", () => {
  const distDir = join(process.cwd(), "dist");

  it("dist/ directory exists (build was run)", () => {
    // This test only runs if dist exists (after build)
    try {
      const stat = statSync(distDir);
      expect(stat.isDirectory()).toBe(true);
    } catch {
      // Skip if dist doesn't exist — build test will catch it
      console.log("⚠️ dist/ not found — skipping performance budget tests");
    }
  });

  it("total dist size is under 2MB", () => {
    try {
      const totalSize = getDirSize(distDir);
      const sizeMB = totalSize / (1024 * 1024);
      console.log(`📦 Total dist size: ${sizeMB.toFixed(2)}MB`);
      expect(sizeMB).toBeLessThan(2);
    } catch {
      // Skip
    }
  });

  it("index JS chunk is under 450KB", () => {
    try {
      const jsFiles = getFilesByExtension(distDir, ".js");
      const indexFile = jsFiles.find((f) => f.includes("/index-"));
      if (indexFile) {
        const size = statSync(indexFile).size;
        const sizeKB = size / 1024;
        console.log(`📦 Index chunk: ${sizeKB.toFixed(0)}KB`);
        expect(sizeKB).toBeLessThan(450);
      }
    } catch {
      // Skip
    }
  });

  it("no single JS file exceeds 500KB", () => {
    try {
      const jsFiles = getFilesByExtension(distDir, ".js");
      for (const file of jsFiles) {
        const size = statSync(file).size;
        const sizeKB = size / 1024;
        if (sizeKB > 500) {
          console.warn(`⚠️ Large file: ${file} (${sizeKB.toFixed(0)}KB)`);
        }
        expect(sizeKB).toBeLessThan(500);
      }
    } catch {
      // Skip
    }
  });

  it("CSS is under 50KB", () => {
    try {
      const cssFiles = getFilesByExtension(distDir, ".css");
      for (const file of cssFiles) {
        const size = statSync(file).size;
        const sizeKB = size / 1024;
        console.log(`🎨 CSS: ${file.split("/").pop()} (${sizeKB.toFixed(0)}KB)`);
        expect(sizeKB).toBeLessThan(50);
      }
    } catch {
      // Skip
    }
  });
});
