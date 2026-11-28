import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const TEST_CSV = readFileSync("test-contacts.csv", "utf-8");

test.describe("MejoraContactos — E2E Autónomo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto("/");
  });

  test("loads the app successfully", async ({ page }) => {
    await expect(page).toHaveTitle(/MejoraContactos/);
    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByRole("heading", { name: "MejoraContactos" })).toBeVisible();
  });

  test("can navigate and complete onboarding wizard", async ({ page }) => {
    await expect(page.getByText("Importá tus contactos")).toBeVisible();
    await page.getByRole("button", { name: /siguiente/i }).click();
    await expect(page.getByText("Limpieza automática local")).toBeVisible();
    await page.getByRole("button", { name: /siguiente/i }).click();
    await expect(page.getByText("Exportá limpio")).toBeVisible();
    await page.getByRole("button", { name: /empezar/i }).click();
    await expect(page.getByText("Importá tus contactos")).not.toBeVisible();
  });

  test("can switch between simple and advanced mode", async ({ page }) => {
    await page.getByRole("button", { name: /saltar/i }).click();
    await expect(page.getByText("Modo simple", { exact: true })).toBeVisible();
    await page.getByTitle(/modo avanzado/i).click();
    await expect(page.getByRole("tab", { name: /importar/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /procesar/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /exportar/i })).toBeVisible();
  });

  test("can import CSV file locally and navigate to process tab", async ({ page }) => {
    await page.getByRole("button", { name: /saltar/i }).click();
    await page.getByTitle(/modo avanzado/i).click();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: "test-contacts.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(TEST_CSV, "utf-8"),
    });
    await page.getByRole("tab", { name: /procesar/i }).click();
    await expect(page.getByText("Procesamiento Local")).toBeVisible();
  });

  test("404 page shows for unknown routes", async ({ page }) => {
    await page.goto("/ruta-inexistente");
    await expect(page.getByText("404")).toBeVisible();
  });
});
