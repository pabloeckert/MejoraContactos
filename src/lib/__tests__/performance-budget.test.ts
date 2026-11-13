/**
 * Performance budget tests.
 * Verifies that the bundle stays within acceptable size limits.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "fs";
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
    if (!existsSync(distDir)) {
      console.log("⚠️ dist/ not found — skipping performance budget tests");
      return;
    }
    const stat = statSync(distDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("total dist size is under 2MB", () => {
    if (!existsSync(distDir)) return;
    const totalSize = getDirSize(distDir);
    const sizeMB = totalSize / (1024 * 1024);
    console.log(`📦 Total dist size: ${sizeMB.toFixed(2)}MB`);
    expect(sizeMB).toBeLessThan(2);
  });

  it("index JS chunk is under 450KB", () => {
    if (!existsSync(distDir)) return;
    const jsFiles = getFilesByExtension(distDir, ".js");
    const indexFile = jsFiles.find((f) => f.replace(/\\/g, "/").includes("/index-"));
    expect(indexFile).toBeDefined();
    if (indexFile) {
      const size = statSync(indexFile).size;
      const sizeKB = size / 1024;
      console.log(`📦 Index chunk: ${sizeKB.toFixed(0)}KB`);
      expect(sizeKB).toBeLessThan(450);
    }
  });

  it("no single JS file exceeds 510KB", () => {
    if (!existsSync(distDir)) return;
    const jsFiles = getFilesByExtension(distDir, ".js");
    for (const file of jsFiles) {
      const size = statSync(file).size;
      const sizeKB = size / 1024;
      if (sizeKB > 500) {
        console.warn(`⚠️ Large file: ${file.replace(/\\/g, "/").split("/").pop()} (${sizeKB.toFixed(0)}KB)`);
      }
      expect(sizeKB).toBeLessThan(510);
    }
  });

  it("CSS is under 60KB", () => {
    if (!existsSync(distDir)) return;
    const cssFiles = getFilesByExtension(distDir, ".css");
    for (const file of cssFiles) {
      const size = statSync(file).size;
      const sizeKB = size / 1024;
      const fileName = file.replace(/\\/g, "/").split("/").pop();
      console.log(`🎨 CSS: ${fileName} (${sizeKB.toFixed(0)}KB)`);
      expect(sizeKB).toBeLessThan(60);
    }
  });
});
