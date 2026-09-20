import { expect, test } from "./fixtures";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Page } from "@playwright/test";

const TARGET_PAGE = `<!doctype html><html><body>
<button id="play" onclick="document.body.dataset.clicked='yes'">Launch playback</button>
${Array.from({ length: 59 }, (_, i) => `<button>filler ${i}</button>`).join("")}
${Array.from({ length: 500 }, (_, i) => `<div>documentation paragraph ${i}</div>`).join("")}
<div id="editor" contenteditable="true">start()</div>
<div id="mirror"></div>
<input id="name">
<div id="events"></div>
<script>
const editor = document.getElementById("editor");
const mirror = document.getElementById("mirror");
editor.addEventListener("beforeinput", (e) => {
  e.preventDefault();
  if (e.inputType === "insertReplacementText") editor.textContent = e.data;
  else if (e.inputType === "insertText") editor.textContent += e.data;
  mirror.textContent = editor.textContent;
});
const log = [];
const nameInput = document.getElementById("name");
nameInput.addEventListener("input", () => { log.push("input"); document.getElementById("events").textContent = log.join(","); });
nameInput.addEventListener("change", () => { log.push("change"); document.getElementById("events").textContent = log.join(","); });
</script>
</body></html>`;

interface ChatMessage {
  role: string;
  content?: string;
}

type Script = (
  toolResults: string[],
  lastRole: string,
) => { tool?: { name: string; args: string }; text?: string };

function sseToolCall(name: string, args: string): string {
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
              function: { name, arguments: args },
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

function startScriptedLlm(
  script: Script,
  onToolResult?: (results: string[]) => void,
): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (!req.url?.endsWith("/chat/completions")) {
        res.writeHead(404, { "access-control-allow-origin": "*" });
        res.end();
        return;
      }
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        let toolResults: string[] = [];
        let lastRole = "user";
        try {
          const body = JSON.parse(raw) as { messages: ChatMessage[] };
          toolResults = body.messages.filter((m) => m.role === "tool").map((m) => m.content ?? "");
          lastRole = body.messages[body.messages.length - 1]?.role ?? "user";
        } catch {
          /* ignore malformed bodies */
        }
        onToolResult?.(toolResults);
        const step = script(toolResults, lastRole);
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "access-control-allow-origin": "*",
        });
        res.end(
          step.tool ? sseToolCall(step.tool.name, step.tool.args) : sseText(step.text ?? "done"),
        );
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/v1` });
    });
  });
}

async function setupPanel(
  context: Parameters<Parameters<typeof test>[2]>[0]["context"],
  extensionId: string,
  baseUrl: string,
) {
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
  }, baseUrl);
  return panel;
}

async function openTargetPage(
  context: Parameters<Parameters<typeof test>[2]>[0]["context"],
): Promise<Page> {
  const page = await context.newPage();
  await page.route("**/page-tools-fixture", async (route) => {
    await route.fulfill({ contentType: "text/html", body: TARGET_PAGE });
  });
  await page.goto("https://example.test/page-tools-fixture");
  await page.bringToFront();
  return page;
}

async function runChat(panel: Page, text: string): Promise<string> {
  const outcome: { deltas: string[]; failed?: unknown } = await panel.evaluate(
    async (messageText) => {
      return await new Promise((resolve) => {
        const port = chrome.runtime.connect({ name: "sancho-ui" });
        const collected: string[] = [];
        const timeout = setTimeout(() => resolve({ deltas: ["TIMEOUT", ...collected] }), 30_000);
        port.onMessage.addListener((message: { type: string; payload?: { text?: string } }) => {
          if (message.type === "chat.delta" && message.payload?.text) {
            collected.push(message.payload.text);
          }
          if (message.type === "chat.done") {
            clearTimeout(timeout);
            resolve({ deltas: collected });
          }
          if (message.type === "chat.error") {
            clearTimeout(timeout);
            resolve({ deltas: collected, failed: message.payload });
          }
        });
        void chrome.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
          port.postMessage({
            kind: "request",
            type: "chat.send",
            id: `page-tools-${Date.now()}`,
            payload: {
              text: messageText,
              tabId: tabs[0]?.id ?? -1,
              conversationId: await new Promise<string>((resolveConv) => {
                const probe = chrome.runtime.connect({ name: "sancho-ui" });
                probe.onMessage.addListener(
                  (message: { type: string; payload?: { id?: string } }) => {
                    if (message.type === "conversation.state" && message.payload?.id) {
                      probe.disconnect();
                      resolveConv(message.payload.id);
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
    },
    text,
  );
  return outcome.deltas.join("");
}

test("snapshot names the button and click-by-ref works on the first attempt", async ({
  context,
  extensionId,
}) => {
  let snapshotStart = 0;
  let snapshotEnd = 0;
  const { server, baseUrl } = await startScriptedLlm((toolResults, lastRole) => {
    if (lastRole === "user") {
      snapshotStart = Date.now();
      return { tool: { name: "snapshotPage", args: "{}" } };
    }
    if (toolResults.length === 1) {
      snapshotEnd = Date.now();
      const snapshot = JSON.parse(toolResults[0]!) as {
        elements: { ref: string; role: string; name: string }[];
      };
      const target = snapshot.elements.find((e) => e.name === "Launch playback");
      return { tool: { name: "clickElement", args: JSON.stringify({ ref: target!.ref }) } };
    }
    return { text: `result: ${toolResults[1]}` };
  });
  try {
    const panel = await setupPanel(context, extensionId, baseUrl);
    const page = await openTargetPage(context);
    const reply = await runChat(panel, "press play");
    expect(reply).toContain('"ok":true');
    expect(reply).toContain('"role":"button"');
    expect(reply).toContain('"name":"Launch playback"');
    await expect(page.locator("body")).toHaveAttribute("data-clicked", "yes");
    expect(snapshotEnd - snapshotStart).toBeLessThan(2_000);
  } finally {
    server.close();
  }
});

test("a stale reference is reported and nothing is clicked", async ({ context, extensionId }) => {
  let capturedFirstRef: string | null = null;
  let userTurns = 0;
  const { server, baseUrl } = await startScriptedLlm((toolResults, lastRole) => {
    if (lastRole === "user") {
      userTurns += 1;
      if (userTurns === 1) return { tool: { name: "snapshotPage", args: "{}" } };
      return { tool: { name: "clickElement", args: JSON.stringify({ ref: capturedFirstRef }) } };
    }
    if (capturedFirstRef === null) {
      const snapshot = JSON.parse(toolResults[toolResults.length - 1]!) as {
        elements: { ref: string }[];
      };
      capturedFirstRef = snapshot.elements[0]!.ref;
      return { text: "snapshot taken" };
    }
    return { text: `result: ${toolResults[toolResults.length - 1]}` };
  });
  try {
    const panel = await setupPanel(context, extensionId, baseUrl);
    const page = await openTargetPage(context);
    const first = await runChat(panel, "snapshot the page");
    expect(first).toContain("snapshot taken");

    await page.reload();

    const second = await runChat(panel, "click the first element from your snapshot");
    expect(second).toContain("stale reference");
    await expect(page.locator("body")).not.toHaveAttribute("data-clicked", "yes");
  } finally {
    server.close();
  }
});

test("setEditorText drives editor state, insert mode, and plain inputs", async ({
  context,
  extensionId,
}) => {
  const { server, baseUrl } = await startScriptedLlm((toolResults, lastRole) => {
    if (lastRole === "user") {
      return {
        tool: {
          name: "setEditorText",
          args: JSON.stringify({ selector: "#editor", text: 's("bd hh")', mode: "replace" }),
        },
      };
    }
    if (toolResults.length === 1) {
      return {
        tool: {
          name: "setEditorText",
          args: JSON.stringify({ selector: "#editor", text: " .cpm(120)", mode: "insert" }),
        },
      };
    }
    if (toolResults.length === 2) {
      return {
        tool: {
          name: "setEditorText",
          args: JSON.stringify({ selector: "#name", text: "Ada", mode: "replace" }),
        },
      };
    }
    return { text: `result: ${toolResults[2]}` };
  });
  try {
    const panel = await setupPanel(context, extensionId, baseUrl);
    const page = await openTargetPage(context);
    const reply = await runChat(panel, "update the editor and the name field");
    expect(reply).toContain('"ok":true');
    expect(reply).toContain('"role":"textbox"');
    await expect(page.locator("#mirror")).toHaveText('s("bd hh") .cpm(120)');
    await expect(page.locator("#name")).toHaveValue("Ada");
    await expect(page.locator("#events")).toHaveText("input,change");
  } finally {
    server.close();
  }
});
