import { expect, test } from "./fixtures";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

function sseResponse(text: string): string {
  const chunk = {
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    created: 0,
    model: "mock",
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  };
  const done = {
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    created: 0,
    model: "mock",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };
  return `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`;
}

function startMockLlm(replyText: string): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url?.endsWith("/chat/completions")) {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "access-control-allow-origin": "*",
        });
        res.end(sseResponse(replyText));
      } else {
        res.writeHead(404, { "access-control-allow-origin": "*" });
        res.end();
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/v1` });
    });
  });
}

const FORM_PAGE = `<!doctype html><html><body>
<textarea id="draft" rows="4" cols="40">teh quick brown fox</textarea>
</body></html>`;

test("context-menu action replaces editable selection via native events", async ({
  context,
  extensionId,
}) => {
  const { server, baseUrl } = await startMockLlm("the quick brown fox");
  try {
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    await panel.evaluate(async (endpoint) => {
      await chrome.storage.sync.set({
        providerConfig: {
          method: "api",
          providerId: "custom",
          baseUrl: endpoint,
          model: "mock-model",
          apiKeyRef: "mock",
        },
        actions: [
          {
            id: "fix-grammar",
            name: "Fix grammar",
            prompt: "Fix grammar of: {{selection}}",
            builtin: true,
            enabled: true,
          },
        ],
      });
      await chrome.storage.local.set({ "apiKey:mock": { key: "sk-mock" } });
    }, baseUrl);

    const page = await context.newPage();
    await page.route("**/form-fixture", async (route) => {
      await route.fulfill({ contentType: "text/html", body: FORM_PAGE });
    });
    await page.goto("https://example.test/form-fixture");

    const textarea = page.locator("#draft");
    await textarea.click();
    await page.evaluate(() => {
      const field = document.getElementById("draft") as HTMLTextAreaElement;
      field.focus();
      field.setSelectionRange(0, field.value.length);
    });

    const tabId = await panel.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const target = tabs.find((tab) => tab.url?.includes("form-fixture"));
      return target?.id ?? -1;
    });
    expect(tabId).toBeGreaterThan(-1);

    const result = await panel.evaluate(async (targetTabId) => {
      return await new Promise((resolve) => {
        const port = chrome.runtime.connect({ name: "sancho-ui" });
        const timeout = setTimeout(() => resolve({ timeout: true }), 15_000);
        port.onMessage.addListener((message: { type: string; payload?: unknown }) => {
          if (message.type === "action.result") {
            clearTimeout(timeout);
            resolve(message.payload);
          }
          if (message.type === "chat.error") {
            clearTimeout(timeout);
            resolve({ error: message.payload });
          }
        });
        port.postMessage({
          kind: "request",
          type: "action.run",
          id: "e2e-1",
          payload: { actionId: "fix-grammar", tabId: targetTabId, selection: "", editable: true },
        });
      });
    }, tabId);

    expect(result).toMatchObject({ actionId: "fix-grammar", replacement: "the quick brown fox" });
    await expect(textarea).toHaveValue("the quick brown fox");
  } finally {
    server.close();
  }
});
