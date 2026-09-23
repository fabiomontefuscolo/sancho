import { expect, test } from "./fixtures";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

function sseToolCall(name: string): string {
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
              function: { name, arguments: "{}" },
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

async function sendChat(
  panel: { evaluate: <T>(fn: (text: string) => Promise<T>, arg: string) => Promise<T> },
  text: string,
): Promise<{ deltas: string[]; consentPrompted: boolean }> {
  return panel.evaluate(async (messageText) => {
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
          if (
            message.type === "chat.error" &&
            message.payload?.message === "diagnostics_consent_required"
          ) {
            consentPrompted = true;
          }
          if (message.type === "chat.done") {
            clearTimeout(timeout);
            resolve({ deltas: collected, consentPrompted });
          }
        },
      );
      void chrome.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
        port.postMessage({
          kind: "request",
          type: "chat.send",
          id: crypto.randomUUID(),
          payload: {
            text: messageText,
            tabId: tabs[0]?.id ?? -1,
            conversationId: await new Promise<string>((resolve) => {
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
            }),
          },
        });
      });
    });
  }, text);
}

test("page diagnostics: consent-gated console and network tools", async ({
  context,
  extensionId,
}) => {
  const server: Server = createServer((req, res) => {
    if (req.url?.startsWith("/diag-fixture")) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        '<html><body><h1>diag fixture</h1><script>console.error("e2e diag boom");</script></body></html>',
      );
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "access-control-allow-origin": "*",
      });
      let messages: { role?: string; content?: unknown }[];
      try {
        messages =
          (JSON.parse(body) as { messages?: { role?: string; content?: unknown }[] }).messages ??
          [];
      } catch {
        res.end(sseText("empty request"));
        return;
      }
      const last = messages[messages.length - 1];
      const lastText = JSON.stringify(last ?? {});
      if (last?.role === "tool") {
        if (lastText.includes("e2e diag boom")) res.end(sseText("I see the console error"));
        else if (lastText.includes("diag-fixture")) res.end(sseText("I see the network requests"));
        else res.end(sseText("tool returned nothing useful"));
      } else if (lastText.includes("check network")) {
        res.end(sseToolCall("getNetworkRequests"));
      } else {
        res.end(sseToolCall("getConsoleMessages"));
      }
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
    await page.goto(`http://127.0.0.1:${mockPort}/diag-fixture`);
    await page.bringToFront();

    const first = await sendChat(panel, "check console");
    expect(first.consentPrompted).toBe(true);
    expect(first.deltas.join("")).toContain("tool returned nothing useful");

    await panel.evaluate(async () => {
      const port = chrome.runtime.connect({ name: "sancho-ui" });
      port.postMessage({
        kind: "request",
        type: "diagnostics.consent",
        id: "c1",
        payload: { granted: true },
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      port.disconnect();
    });

    const second = await sendChat(panel, "check console");
    expect(second.consentPrompted).toBe(false);
    expect(second.deltas.join("")).toContain("I see the console error");

    const third = await sendChat(panel, "check network");
    expect(third.consentPrompted).toBe(false);
    expect(third.deltas.join("")).toContain("I see the network requests");

    await panel.evaluate(async () => {
      const port = chrome.runtime.connect({ name: "sancho-ui" });
      port.postMessage({ kind: "request", type: "chat.clear", id: "c2", payload: {} });
      await new Promise((resolve) => setTimeout(resolve, 300));
      port.disconnect();
    });

    const fourth = await sendChat(panel, "check console");
    expect(fourth.consentPrompted).toBe(true);
  } finally {
    server.close();
  }
});
