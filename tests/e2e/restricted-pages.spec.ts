import { expect, test } from "./fixtures";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

function sseText(text: string): string {
  const chunk = {
    id: "x",
    object: "chat.completion.chunk",
    created: 0,
    model: "m",
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  };
  const done = {
    id: "x",
    object: "chat.completion.chunk",
    created: 0,
    model: "m",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };
  return `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`;
}

test("chat stays available on restricted pages while page tools report unavailable", async ({
  context,
  extensionId,
}) => {
  const server: Server = createServer((req, res) => {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "access-control-allow-origin": "*",
    });
    res.end(sseText("chat works fine"));
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

    const restricted = await context.newPage();
    await restricted.goto("chrome://version");
    await restricted.bringToFront();

    const result: { deltas: string[]; toolError: boolean; firstDeltaMs: number } =
      await panel.evaluate(async () => {
        return await new Promise((resolve) => {
          const port = chrome.runtime.connect({ name: "sancho-ui" });
          const collected: string[] = [];
          const sentAt = Date.now();
          let firstDeltaMs = -1;
          const timeout = setTimeout(
            () => resolve({ deltas: ["TIMEOUT"], toolError: false, firstDeltaMs }),
            20_000,
          );
          port.onMessage.addListener((message: { type: string; payload?: { text?: string } }) => {
            if (message.type === "chat.delta" && message.payload?.text) {
              if (firstDeltaMs < 0) firstDeltaMs = Date.now() - sentAt;
              collected.push(message.payload.text);
            }
            if (message.type === "chat.done") {
              clearTimeout(timeout);
              resolve({ deltas: collected, toolError: true, firstDeltaMs });
            }
          });
          void chrome.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
            const conversationId = await new Promise<string>((resolve) => {
              const probe = chrome.runtime.connect({ name: "sancho-ui" });
              probe.onMessage.addListener(
                (message: { type: string; payload?: { id?: string } }) => {
                  if (message.type === "conversation.state" && message.payload?.id) {
                    probe.disconnect();
                    resolve(message.payload.id);
                  }
                },
              );
              probe.postMessage({
                kind: "request",
                type: "conversation.get",
                id: "probe",
                payload: {},
              });
            });
            port.postMessage({
              kind: "request",
              type: "chat.send",
              id: "r1",
              payload: { text: "hello", tabId: tabs[0]?.id ?? -1, conversationId },
            });
          });
        });
      });

    expect(result.deltas.join("")).toContain("chat works fine");
    expect(result.firstDeltaMs).toBeGreaterThanOrEqual(0);
    expect(result.firstDeltaMs).toBeLessThan(5_000);

    const injectionBlocked: boolean = await panel.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id ?? -1;
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content-scripts/content.js"],
        });
        return false;
      } catch {
        return true;
      }
    });
    expect(injectionBlocked).toBe(true);
  } finally {
    server.close();
  }
});
