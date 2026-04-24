import { test, expect } from "@playwright/test";

test.describe("MejoraContactos — E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to reset onboarding state
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

  test("shows onboarding wizard on first visit", async ({ page }) => {
    await expect(page.getByText("Importá tus contactos")).toBeVisible();
    await expect(page.getByRole("button", { name: /siguiente/i })).toBeVisible();
  });

  test("can navigate onboarding wizard", async ({ page }) => {
    await expect(page.getByText("Importá tus contactos")).toBeVisible();
    await page.getByRole("button", { name: /siguiente/i }).click();
    await expect(page.getByText("La IA limpia por vos")).toBeVisible();
    await page.getByRole("button", { name: /siguiente/i }).click();
    await expect(page.getByText("Exportá limpio")).toBeVisible();
    await page.getByRole("button", { name: /empezar/i }).click();
    await expect(page.getByText("Importá tus contactos")).not.toBeVisible();
  });

  test("can skip onboarding", async ({ page }) => {
    await expect(page.getByText("Importá tus contactos")).toBeVisible();
    await page.getByRole("button", { name: /saltar/i }).click();
    await expect(page.getByText("Importá tus contactos")).not.toBeVisible();
  });

  test("shows import area after onboarding", async ({ page }) => {
    await page.getByRole("button", { name: /saltar/i }).click();
    await expect(page.getByText(/arrastrá archivos/i)).toBeVisible();
  });

  test("can toggle theme", async ({ page }) => {
    await page.getByRole("button", { name: /saltar/i }).click();
    const html = page.locator("html");
    const initialTheme = await html.getAttribute("class");
    await page.getByRole("button", { name: /cambiar tema/i }).click();
    const newTheme = await html.getAttribute("class");
    expect(newTheme).not.toBe(initialTheme);
  });

  test("can switch between simple and advanced mode", async ({ page }) => {
    await page.getByRole("button", { name: /saltar/i }).click();

    // Default should be simple mode — look for the label text
    await expect(page.getByText("Modo simple")).toBeVisible();

    // Switch to advanced using the title attribute
    await page.getByTitle(/modo avanzado/i).click();

    // Should show tab triggers
    await expect(page.getByRole("tab", { name: /importar/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /procesar/i })).toBeVisible();

    // Switch back to simple
    await page.getByTitle(/modo simple/i).click();
    await expect(page.getByText("Modo simple")).toBeVisible();
  });

  test("shows empty states for results/export/dashboard", async ({ page }) => {
    await page.getByRole("button", { name: /saltar/i }).click();

    // Switch to advanced mode
    await page.getByTitle(/modo avanzado/i).click();

    // Go to results tab
    await page.getByRole("tab", { name: /resultados/i }).click();
    await expect(page.getByText("Sin resultados todavía")).toBeVisible();

    // Go to export tab
    await page.getByRole("tab", { name: /exportar/i }).click();
    await expect(page.getByText("Nada para exportar")).toBeVisible();

    // Go to dashboard tab
    await page.getByRole("tab", { name: /dashboard/i }).click();
    await expect(page.getByText("Dashboard vacío")).toBeVisible();
  });

  test("settings tab shows API keys panel", async ({ page }) => {
    await page.getByRole("button", { name: /saltar/i }).click();

    // Switch to advanced mode
    await page.getByTitle(/modo avanzado/i).click();

    // Go to settings tab
    const settingsTab = page.getByRole("tab", { name: /config/i });
    await settingsTab.click();
    await page.waitForTimeout(500);

    // Should show the API keys admin panel
    await expect(page.getByText(/administrador de api keys/i)).toBeVisible({ timeout: 10000 });
  });

  test("footer has privacy and terms links", async ({ page }) => {
    await page.getByRole("button", { name: /saltar/i }).click();
    await expect(page.getByRole("link", { name: /privacidad/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /términos/i })).toBeVisible();
  });

  test("privacy page loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /política de privacidad/i })).toBeVisible();
  });

  test("terms page loads", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /términos de servicio/i })).toBeVisible();
  });

  test("PWA manifest is accessible", async ({ page }) => {
    const response = await page.request.get("/manifest.json");
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();
    expect(manifest.name).toBe("MejoraContactos");
    expect(manifest.display).toBe("standalone");
  });

  test("no console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForTimeout(2000);
    const criticalErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("manifest") && !e.includes("SW registration")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
