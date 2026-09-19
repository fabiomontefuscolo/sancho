import { test as base, chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const extensionPath = path.resolve(".output/chrome-mv3");

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
      throw new Error("Extension not built. Run `pnpm build` before `pnpm test:e2e`.");
    }
    const userDataDir = path.resolve(`test-results/.userdata-${crypto.randomUUID()}`);
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new",
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent("serviceworker");
    }
    const extensionId = worker.url().split("/")[2];
    if (!extensionId) {
      throw new Error("Could not determine extension id from service worker URL");
    }
    await use(extensionId);
  },
});

export const expect = test.expect;
