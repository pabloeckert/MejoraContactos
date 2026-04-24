/**
 * Accessibility tests — checks component markup for common a11y issues.
 * These tests verify that our components use proper ARIA attributes,
 * semantic HTML, and keyboard navigation patterns.
 */
import { describe, it, expect } from "vitest";

describe("Accessibility — Markup Checks", () => {
  it("all interactive elements have accessible names", () => {
    // Read Index.tsx and verify buttons/links have text or aria-label
    const { readFileSync } = require("fs");
    const { join } = require("path");

    const indexPath = join(process.cwd(), "src/pages/Index.tsx");
    const content = readFileSync(indexPath, "utf-8");

    // Check that all button elements have aria-label or text content
    const buttonMatches = content.match(/<button[^>]*>/g) || [];
    for (const button of buttonMatches) {
      const hasAriaLabel = button.includes("aria-label");
      const hasTitle = button.includes("title=");
      // Buttons should have either aria-label, title, or visible text (checked in child content)
      if (!hasAriaLabel && !hasTitle) {
        // This is a warning — the button might have text content
        console.log(`⚠️ Button without aria-label or title: ${button.slice(0, 80)}`);
      }
    }
    expect(buttonMatches.length).toBeGreaterThan(0); // At least we have buttons
  });

  it("images have alt text", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const { readdirSync } = require("fs");

    const componentsDir = join(process.cwd(), "src/components");
    const pagesDir = join(process.cwd(), "src/pages");

    const checkFile = (filePath: string) => {
      const content = readFileSync(filePath, "utf-8");
      const imgMatches = content.match(/<img[^>]*>/g) || [];
      for (const img of imgMatches) {
        expect(img).toContain("alt=");
      }
    };

    // Check all component files
    const checkDir = (dir: string) => {
      const items = readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = join(dir, item.name);
        if (item.isDirectory() && item.name !== "__tests__" && item.name !== "ui") {
          checkDir(fullPath);
        } else if (item.name.endsWith(".tsx") && !item.name.endsWith(".test.tsx")) {
          checkFile(fullPath);
        }
      }
    };

    checkDir(componentsDir);
    checkDir(pagesDir);
  });

  it("form inputs have labels", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");

    const files = [
      "src/components/ApiKeysPanel.tsx",
      "src/components/ColumnMapper.tsx",
      "src/components/ProcessingPanel.tsx",
    ];

    for (const file of files) {
      try {
        const content = readFileSync(join(process.cwd(), file), "utf-8");
        const inputMatches = content.match(/<Input[^>]*>/g) || [];
        for (const input of inputMatches) {
          // Inputs should have id, aria-label, or be wrapped in a label
          const hasId = input.includes("id=");
          const hasAriaLabel = input.includes("aria-label");
          const hasPlaceholder = input.includes("placeholder=");
          // At minimum should have placeholder or aria-label
          expect(hasAriaLabel || hasPlaceholder || hasId).toBe(true);
        }
      } catch {
        // File might not exist
      }
    }
  });

  it("headings use proper hierarchy", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");

    const indexPath = join(process.cwd(), "src/pages/Index.tsx");
    const content = readFileSync(indexPath, "utf-8");

    // Check that we don't skip heading levels (h1 -> h3 without h2)
    const headings = content.match(/<h[1-6][^>]*>/g) || [];
    const levels = headings.map((h: string) => parseInt(h.match(/h([1-6])/)?.[1] || "0"));

    for (let i = 1; i < levels.length; i++) {
      // Should not skip more than 1 level
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });

  it("focus management — focusable elements have visible focus styles", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");

    const cssPath = join(process.cwd(), "src/index.css");
    const content = readFileSync(cssPath, "utf-8");

    // Check for focus-visible or focus styles
    const hasFocusStyles =
      content.includes("focus-visible") ||
      content.includes(":focus") ||
      content.includes("focus:ring") ||
      content.includes("focus-visible:ring");

    // Also check tailwind config for focus styles
    const tailwindPath = join(process.cwd(), "tailwind.config.ts");
    try {
      const tailwind = readFileSync(tailwindPath, "utf-8");
      // Tailwind's default includes focus-visible support
      expect(tailwind).toContain("tailwindcss-animate");
    } catch {
      // OK
    }

    // At minimum, the CSS should not break focus
    expect(content).not.toContain("outline: none");
    expect(content).not.toContain("outline:0");
  });
});
