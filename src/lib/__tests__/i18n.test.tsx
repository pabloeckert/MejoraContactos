import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider, useI18n } from "../i18n";
import { es } from "../locales/es";
import { en } from "../locales/en";

// Helper component to test useI18n hook
function TestComponent() {
  const { t, locale, setLocale } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="translated">{t("app.name")}</span>
      <span data-testid="interpolated">{t("stats.contacts", { count: 42 })}</span>
      <span data-testid="missing">{t("nonexistent.key")}</span>
      <button onClick={() => setLocale("en")}>Switch to EN</button>
      <button onClick={() => setLocale("es")}>Switch to ES</button>
    </div>
  );
}

describe("i18n", () => {
  it("provides default locale based on browser (or 'es' as fallback)", () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );
    const locale = screen.getByTestId("locale").textContent;
    expect(["es", "en"]).toContain(locale);
  });

  it("translates keys to current locale", () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );
    const translated = screen.getByTestId("translated").textContent;
    expect(translated).toBe("MejoraContactos");
  });

  it("returns key itself for missing translations", () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );
    const missing = screen.getByTestId("missing").textContent;
    expect(missing).toBe("nonexistent.key");
  });

  it("switches locale when setLocale is called", () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );

    // Click switch to EN
    const enButton = screen.getByText("Switch to EN");
    enButton.click();

    expect(screen.getByTestId("locale").textContent).toBe("en");
  });

  it("Spanish and English locales have the same keys", () => {
    const esKeys = Object.keys(es).sort();
    const enKeys = Object.keys(en).sort();
    expect(esKeys).toEqual(enKeys);
  });

  it("all locale values are non-empty strings", () => {
    for (const [key, val] of Object.entries(es)) {
      expect(val, `es.${key} should be non-empty`).toBeTruthy();
    }
    for (const [key, val] of Object.entries(en)) {
      expect(val, `en.${key} should be non-empty`).toBeTruthy();
    }
  });
});
