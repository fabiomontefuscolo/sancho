import { expect, test } from "./fixtures";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

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

function sseReasoning(reasoning: string, text: string): string {
  const reasoningChunk = {
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    created: 0,
    model: "mock",
    choices: [{ index: 0, delta: { reasoning_content: reasoning }, finish_reason: null }],
  };
  const textChunk = {
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
  return `data: ${JSON.stringify(reasoningChunk)}\n\ndata: ${JSON.stringify(textChunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`;
}

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
              id: "call_mock",
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

type Script = Array<
  { type: "text"; text: string } | { type: "reasoning"; text: string } | { type: "tool" }
>;

function startScriptedServer(script: Script): Promise<{ server: Server; endpoint: string }> {
  let call = 0;
  const server = createServer((req, res) => {
    if (req.url?.endsWith("/chat/completions")) {
      const step = script[Math.min(call, script.length - 1)] ?? { type: "text", text: "done" };
      call += 1;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "access-control-allow-origin": "*",
      });
      if (step.type === "tool") res.end(sseToolCall());
      else if (step.type === "reasoning") res.end(sseReasoning(step.text, "final answer"));
      else res.end(sseText(step.text));
    } else {
      res.writeHead(404, { "access-control-allow-origin": "*" });
      res.end();
    }
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, endpoint: `http://127.0.0.1:${port}/v1` });
    }),
  );
}

async function configureProvider(panel: import("@playwright/test").Page, endpoint: string) {
  await panel.evaluate(async (baseUrl) => {
    await chrome.storage.sync.set({
      providerConfig: {
        method: "api",
        providerId: "custom",
        baseUrl,
        model: "mock-model",
        apiKeyRef: "mock",
      },
    });
    await chrome.storage.local.set({ "apiKey:mock": { key: "sk-mock" } });
  }, endpoint);
}

async function sendChat(panel: import("@playwright/test").Page, text: string): Promise<void> {
  await panel.getByRole("textbox", { name: /message/i }).fill(text);
  await panel.getByRole("button", { name: /^send$/i }).click();
}

test("thought process group shows tool calls inside the assistant message", async ({
  context,
  extensionId,
}) => {
  const { server, endpoint } = await startScriptedServer([
    { type: "tool" },
    { type: "text", text: "read it for you" },
  ]);
  try {
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await configureProvider(panel, endpoint);

    await sendChat(panel, "read the page");
    await expect(panel.getByText("read it for you")).toBeVisible();

    const thought = panel.locator(".sancho-thought");
    await expect(thought).toBeVisible();
    await expect(thought.getByText("Thought process")).toBeVisible();
    await expect(thought.locator(".sancho-tool-name")).toHaveText("readPage");
    await expect(thought.locator(".sancho-tool-status")).toHaveText("done");

    await panel.reload();
    await expect(panel.getByText("read it for you")).toBeVisible();
    await expect(panel.locator(".sancho-thought")).toHaveCount(0);
  } finally {
    server.close();
  }
});

test("reasoning streams into the thought process group", async ({ context, extensionId }) => {
  const { server, endpoint } = await startScriptedServer([
    { type: "reasoning", text: "pondering deeply" },
  ]);
  try {
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await configureProvider(panel, endpoint);

    await sendChat(panel, "think about it");
    await expect(panel.getByText("final answer")).toBeVisible();
    await expect(panel.locator(".sancho-reasoning")).toHaveText("pondering deeply");
  } finally {
    server.close();
  }
});

test("regenerate replaces the assistant reply", async ({ context, extensionId }) => {
  const { server, endpoint } = await startScriptedServer([
    { type: "text", text: "first reply" },
    { type: "text", text: "second reply" },
  ]);
  try {
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await configureProvider(panel, endpoint);

    await sendChat(panel, "hello");
    await expect(panel.getByText("first reply")).toBeVisible();

    await panel.locator(".sancho-message-assistant").hover();
    await panel.getByRole("button", { name: /regenerate/i }).click();

    await expect(panel.getByText("second reply")).toBeVisible();
    await expect(panel.getByText("first reply")).toHaveCount(0);

    const roles = await panel.evaluate(async () => {
      const result = await chrome.storage.local.get("conversations.index");
      const index = (result["conversations.index"] ?? []) as Array<{ id: string }>;
      const record = await chrome.storage.local.get(`conversation:${index[0]?.id}`);
      const conversation = record[`conversation:${index[0]?.id}`] as {
        messages: Array<{ role: string }>;
      };
      return conversation.messages.map((message) => message.role);
    });
    expect(roles).toEqual(["user", "assistant"]);
  } finally {
    server.close();
  }
});
