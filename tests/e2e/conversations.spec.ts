import { expect, test } from "./fixtures";
import { chromium } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import fs from "node:fs";

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

function startMockServer(reply: string): Promise<{ server: Server; endpoint: string }> {
  const server = createServer((req, res) => {
    if (req.url?.endsWith("/chat/completions")) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "access-control-allow-origin": "*",
      });
      res.end(sseText(reply));
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

async function configureProvider(
  panel: import("@playwright/test").Page,
  endpoint: string,
): Promise<void> {
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

test("conversations: switch, create, delete via the list view", async ({
  context,
  extensionId,
}) => {
  const { server, endpoint } = await startMockServer("mock reply here");
  try {
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await configureProvider(panel, endpoint);
    await expect(panel.locator(".sancho-chat-root")).not.toHaveAttribute(
      "data-conversation-id",
      "",
    );

    await sendChat(panel, "first chat question");
    await expect(panel.getByText("mock reply here")).toBeVisible();

    await panel.getByRole("button", { name: /open conversations/i }).click();
    await panel.getByRole("button", { name: /new conversation/i }).click();
    await expect(panel.getByText("How can I help with this page?")).toBeVisible();

    await sendChat(panel, "second chat question");
    await expect(panel.getByText("mock reply here")).toBeVisible();

    await panel.getByRole("button", { name: /open conversations/i }).click();
    const entries = panel.locator(".sancho-conversation-select");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toHaveText("second chat question");
    await expect(entries.nth(1)).toHaveText("first chat question");

    await entries.nth(1).click();
    await expect(panel.getByText("first chat question")).toBeVisible();

    await panel.getByRole("button", { name: /open conversations/i }).click();
    await panel
      .locator(".sancho-conversation-entry", { hasText: "first chat question" })
      .getByRole("button", { name: "Delete conversation" })
      .click();
    await expect(
      panel.getByRole("button", { name: "first chat question", exact: true }),
    ).toHaveCount(0);

    await expect(panel.locator(".sancho-conversation-select")).toHaveCount(2);
    await expect(
      panel.getByRole("button", { name: "second chat question", exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "New conversation", exact: true }),
    ).toBeVisible();

    await panel.getByRole("button", { name: /back to chat/i }).click();
    await expect(panel.getByText("How can I help with this page?")).toBeVisible();
  } finally {
    server.close();
  }
});

test("conversations: list and history render within latency budgets", async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.locator(".sancho-chat-root")).not.toHaveAttribute("data-conversation-id", "");

  await panel.evaluate(async () => {
    const now = Date.now();
    const items: Record<string, unknown> = {};
    const index: unknown[] = [];
    for (let i = 0; i < 100; i += 1) {
      const id = `seed-${i}`;
      const record = {
        id,
        title: `seeded conversation ${i}`,
        messages: [
          {
            id: `m-${i}`,
            role: "user",
            parts: [{ type: "text", text: `seeded message ${i}` }],
            tabId: 1,
            createdAt: now - 100_000 + i * 10,
          },
        ],
        screenshotConsent: false,
        acpSessionId: null,
        createdAt: now - 100_000 + i * 10,
        updatedAt: now - 100_000 + i * 10,
      };
      items[`conversation:${id}`] = record;
      index.push({
        id,
        title: record.title,
        updatedAt: record.updatedAt,
        createdAt: record.createdAt,
        messageCount: 1,
      });
    }
    items["conversations.index"] = index;
    items["activeConversationId"] = "seed-99";
    await chrome.storage.local.set(items);
  });

  await panel.reload();

  const listStart = Date.now();
  await panel.getByRole("button", { name: /open conversations/i }).click();
  await expect(
    panel.getByRole("button", { name: "seeded conversation 99", exact: true }),
  ).toBeVisible();
  expect(Date.now() - listStart).toBeLessThan(1_000);
  await expect(panel.locator(".sancho-conversation-select")).toHaveCount(100);

  const switchStart = Date.now();
  await panel.getByRole("button", { name: "seeded conversation 42", exact: true }).click();
  await expect(panel.getByText("seeded message 42")).toBeVisible();
  expect(Date.now() - switchStart).toBeLessThan(1_000);
});

test("conversations: persist across restart; deleted conversations stay gone", async () => {
  test.setTimeout(120_000);
  const extensionPath = path.resolve(".output/chrome-mv3");
  if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
    throw new Error("Extension not built. Run `pnpm build` before `pnpm test:e2e`.");
  }
  const userDataDir = path.resolve(`test-results/.userdata-restart-${crypto.randomUUID()}`);
  const launchArgs = [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--headless=new",
  ];

  const { server, endpoint } = await startMockServer("restart reply");
  try {
    const first = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: launchArgs,
    });
    let [worker] = first.serviceWorkers();
    if (!worker) worker = await first.waitForEvent("serviceworker");
    const extensionId = worker.url().split("/")[2] ?? "";
    const panel = await first.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await configureProvider(panel, endpoint);

    const chatRoot = panel.locator(".sancho-chat-root");
    await expect(chatRoot).not.toHaveAttribute("data-conversation-id", "");

    await sendChat(panel, "keep this chat");
    await expect(panel.getByText("restart reply")).toBeVisible();

    const previousConversationId = await chatRoot.getAttribute("data-conversation-id");
    await panel.getByRole("button", { name: /open conversations/i }).click();
    await panel.getByRole("button", { name: /new conversation/i }).click();
    await expect(chatRoot).not.toHaveAttribute(
      "data-conversation-id",
      previousConversationId ?? "",
    );
    await sendChat(panel, "delete this chat");
    await expect(panel.getByText("restart reply")).toBeVisible();

    const ids = await panel.evaluate(async () => {
      const result = await chrome.storage.local.get("conversations.index");
      const index = (result["conversations.index"] ?? []) as Array<{
        id: string;
        title: string;
      }>;
      return index.map((entry) => ({ id: entry.id, title: entry.title }));
    });
    const keptId = ids.find((entry) => entry.title === "keep this chat")?.id ?? "";
    const deletedId = ids.find((entry) => entry.title === "delete this chat")?.id ?? "";
    expect(keptId).toBeTruthy();
    expect(deletedId).toBeTruthy();

    await panel.getByRole("button", { name: /open conversations/i }).click();
    await panel
      .locator(".sancho-conversation-entry", { hasText: "delete this chat" })
      .getByRole("button", { name: "Delete conversation" })
      .click();
    await expect(panel.getByRole("button", { name: "delete this chat", exact: true })).toHaveCount(
      0,
    );
    await panel.getByRole("button", { name: /back to chat/i }).click();
    await expect(panel.getByText("How can I help with this page?")).toBeVisible();
    await first.close();

    const second = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: launchArgs,
    });
    let [worker2] = second.serviceWorkers();
    if (!worker2) worker2 = await second.waitForEvent("serviceworker");
    const extensionId2 = worker2.url().split("/")[2] ?? "";
    const panel2 = await second.newPage();
    await panel2.goto(`chrome-extension://${extensionId2}/sidepanel.html`);

    await panel2.getByRole("button", { name: /open conversations/i }).click();
    await expect(panel2.getByRole("button", { name: "keep this chat", exact: true })).toBeVisible();
    await expect(panel2.getByRole("button", { name: "delete this chat", exact: true })).toHaveCount(
      0,
    );

    const rawKeys = await panel2.evaluate(async (goneId) => {
      const all = await chrome.storage.local.get(null);
      return Object.keys(all).filter((key) => key.includes(goneId));
    }, deletedId);
    expect(rawKeys).toEqual([]);
    await second.close();
  } finally {
    server.close();
  }
});
