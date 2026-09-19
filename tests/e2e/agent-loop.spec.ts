import { expect, test } from "./fixtures";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

function sseToolCall(): string {
  const chunk = {
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    created: 0,
    model: "mock",
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: `call_${Date.now()}`,
              type: "function",
              function: { name: "readPage", arguments: "{}" },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  };
  const done = {
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    created: 0,
    model: "mock",
    choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
  };
  return `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`;
}

test("runaway agent loop stops at the 25-iteration cap", async ({ context, extensionId }) => {
  const server: Server = createServer((req, res) => {
    if (req.url?.endsWith("/chat/completions")) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "access-control-allow-origin": "*",
      });
      res.end(sseToolCall());
    } else {
      res.writeHead(404, { "access-control-allow-origin": "*" });
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port: mockPort } = server.address() as AddressInfo;

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
      });
      await chrome.storage.local.set({ "apiKey:mock": { key: "sk-mock" } });
      await chrome.storage.local.set({
        agentSession: {
          conversationId: "global",
          state: "idle",
          iteration: 0,
          maxIterations: 3,
          pendingToolCall: null,
        },
      });
    }, `http://127.0.0.1:${mockPort}/v1`);

    const page = await context.newPage();
    await page.route("**/loop-fixture", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: "<html><body><h1>fixture</h1></body></html>",
      });
    });
    await page.goto("https://example.test/loop-fixture");
    await page.bringToFront();

    const outcome: { deltas: string[]; cancelled: boolean } = await panel.evaluate(async () => {
      return await new Promise((resolve) => {
        const port = chrome.runtime.connect({ name: "sancho-ui" });
        const collected: string[] = [];
        const timeout = setTimeout(
          () => resolve({ deltas: ["TIMEOUT"], cancelled: false }),
          30_000,
        );
        port.onMessage.addListener(
          (message: { type: string; payload?: { text?: string; cancelled?: boolean } }) => {
            if (message.type === "chat.delta" && message.payload?.text) {
              collected.push(message.payload.text);
            }
            if (message.type === "chat.done") {
              clearTimeout(timeout);
              resolve({ deltas: collected, cancelled: message.payload?.cancelled === true });
            }
          },
        );
        void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
          port.postMessage({
            kind: "request",
            type: "chat.send",
            id: "loop-1",
            payload: { text: "loop forever", tabId: tabs[0]?.id ?? -1 },
          });
        });
      });
    });

    expect(outcome.deltas.join("")).toContain("safety limit");
    expect(outcome.cancelled).toBe(true);
  } finally {
    server.close();
  }
});
