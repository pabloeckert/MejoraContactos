import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  saveBridgeToken,
  loadBridgeToken,
  clearBridgeToken,
  getBridgeStatus,
  MEJORAWS_PROTOCOL_URL,
} from "@/lib/mejoraws-bridge";

describe("mejoraws-bridge", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips a token through save/load, encrypted at rest", async () => {
    await saveBridgeToken("abc123token");
    const raw = localStorage.getItem("mejoraws_bridge_token_v1");
    expect(raw).not.toBeNull();
    expect(raw).not.toContain("abc123token"); // no queda en texto plano en localStorage

    const loaded = await loadBridgeToken();
    expect(loaded).toBe("abc123token");
  });

  it("trims whitespace before saving", async () => {
    await saveBridgeToken("  con-espacios  ");
    expect(await loadBridgeToken()).toBe("con-espacios");
  });

  it("returns null when no token was ever saved", async () => {
    expect(await loadBridgeToken()).toBeNull();
  });

  it("clearBridgeToken removes the saved token", async () => {
    await saveBridgeToken("token-a-borrar");
    clearBridgeToken();
    expect(await loadBridgeToken()).toBeNull();
  });

  it("getBridgeStatus returns the parsed status on success", async () => {
    const fakeStatus = {
      connected: true,
      waStatus: "conectado",
      campaignRunning: false,
      stopRequested: false,
      pauseRequested: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fakeStatus),
      }),
    );

    const status = await getBridgeStatus("un-token");

    expect(status).toEqual(fakeStatus);
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:4180/status",
      expect.objectContaining({ headers: { "X-Bridge-Token": "un-token" } }),
    );
  });

  it("getBridgeStatus returns null on a non-ok response (ej. 401 sin token válido)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));

    expect(await getBridgeStatus("token-invalido")).toBeNull();
  });

  it("getBridgeStatus returns null instead of throwing when MejoraWS no está corriendo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    expect(await getBridgeStatus("cualquier-token")).toBeNull();
  });

  it("exposes the mejoraws:// protocol link used by the 'Abrir MejoraWS' button", () => {
    expect(MEJORAWS_PROTOCOL_URL).toBe("mejoraws://open");
  });
});
