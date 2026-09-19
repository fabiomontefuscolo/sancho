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
              function: { name: "captureScreenshot", arguments: "{}" },
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

function sseText(text: string): string {
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

async function sendChat(panel: {
  evaluate: <T>(fn: () => Promise<T>) => Promise<T>;
}): Promise<{ deltas: string[]; consentPrompted: boolean }> {
  return panel.evaluate(async () => {
    return await new Promise((resolve) => {
      const port = chrome.runtime.connect({ name: "sancho-ui" });
      const collected: string[] = [];
      let consentPrompted = false;
      const timeout = setTimeout(() => resolve({ deltas: ["TIMEOUT"], consentPrompted }), 30_000);
      port.onMessage.addListener(
        (message: { type: string; payload?: { text?: string; message?: string } }) => {
          if (message.type === "chat.delta" && message.payload?.text) {
            collected.push(message.payload.text);
          }
          if (message.type === "chat.error" && message.payload?.message === "consent_required") {
            consentPrompted = true;
          }
          if (message.type === "chat.done") {
            clearTimeout(timeout);
            resolve({ deltas: collected, consentPrompted });
          }
        },
      );
      void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        port.postMessage({
          kind: "request",
          type: "chat.send",
          id: crypto.randomUUID(),
          payload: { text: "look at the page", tabId: tabs[0]?.id ?? -1 },
        });
      });
    });
  });
}

test("screenshot consent: prompted once per conversation, reset after clear", async ({
  context,
  extensionId,
}) => {
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "access-control-allow-origin": "*",
      });
      if (body.includes("consent_required")) res.end(sseText("I cannot see the page"));
      else if (body.includes("imageBase64")) res.end(sseText("I can see the page"));
      else res.end(sseToolCall());
    });
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
    }, `http://127.0.0.1:${mockPort}/v1`);

    const page = await context.newPage();
    await page.route("**/consent-fixture", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: "<html><body><h1>consent fixture</h1></body></html>",
      });
    });
    await page.goto("https://example.test/consent-fixture");
    await page.bringToFront();

    const first = await sendChat(panel);
    expect(first.consentPrompted).toBe(true);
    expect(first.deltas.join("")).toContain("I cannot see the page");

    await panel.evaluate(async () => {
      const port = chrome.runtime.connect({ name: "sancho-ui" });
      port.postMessage({
        kind: "request",
        type: "screenshot.consent",
        id: "c1",
        payload: { granted: true },
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      port.disconnect();
    });

    const second = await sendChat(panel);
    expect(second.consentPrompted).toBe(false);
    expect(second.deltas.join("")).toContain("I can see the page");

    await panel.evaluate(async () => {
      const port = chrome.runtime.connect({ name: "sancho-ui" });
      port.postMessage({ kind: "request", type: "chat.clear", id: "c2", payload: {} });
      await new Promise((resolve) => setTimeout(resolve, 300));
      port.disconnect();
    });

    const third = await sendChat(panel);
    expect(third.consentPrompted).toBe(true);
  } finally {
    server.close();
  }
});
