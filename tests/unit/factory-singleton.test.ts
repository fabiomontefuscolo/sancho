import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { saveProviderConfig } from "../../src/storage/settings";
import { AcpProvider } from "../../src/providers/acp";
import { createProvider, resetCachedAcpProvider } from "../../src/providers/factory";

const acpConfig = {
  method: "acp" as const,
  providerId: "acp",
  baseUrl: "http://localhost",
  model: "acp",
  apiKeyRef: "none",
  acp: { hostName: "com.sancho.acp_host", token: "tok" },
};

describe("ACP provider singleton", () => {
  beforeEach(() => {
    installMockChrome();
    resetCachedAcpProvider();
  });

  it("reuses one provider instance across calls", async () => {
    await saveProviderConfig(acpConfig);
    const first = await createProvider();
    const second = await createProvider();
    expect(first).toBe(second);
    expect(first).toBeInstanceOf(AcpProvider);
  });

  it("recreates the provider when the config changes", async () => {
    await saveProviderConfig(acpConfig);
    const first = await createProvider();
    await saveProviderConfig({ ...acpConfig, acp: { hostName: "com.other.host" } });
    const second = await createProvider();
    expect(second).not.toBe(first);
  });

  it("disposes the cached provider when switching to a cloud provider", async () => {
    await saveProviderConfig(acpConfig);
    const first = (await createProvider()) as AcpProvider;
    const disposeSpy = vi.spyOn(first, "dispose");
    await saveProviderConfig({
      method: "api",
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiKeyRef: "openai",
    });
    const { saveApiKey } = await import("../../src/storage/local");
    await saveApiKey("openai", "sk-test");
    await createProvider();
    expect(disposeSpy).toHaveBeenCalled();
  });
});
