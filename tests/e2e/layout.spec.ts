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

async function seedConversation(
  panel: import("@playwright/test").Page,
  messages: unknown[],
): Promise<void> {
  await panel.evaluate(async (msgs) => {
    const now = Date.now();
    await chrome.storage.local.set({
      "conversation:layout-1": {
        id: "layout-1",
        title: "layout seed",
        messages: msgs,
        screenshotConsent: false,
        acpSessionId: null,
        createdAt: now,
        updatedAt: now,
      },
      "conversations.index": [
        {
          id: "layout-1",
          title: "layout seed",
          updatedAt: now,
          createdAt: now,
          messageCount: (msgs as unknown[]).length,
        },
      ],
      activeConversationId: "layout-1",
    });
  }, messages);
  await panel.reload();
}

test("layout: full-bleed views with a single scrollbar", async ({ context, extensionId }) => {
  const { server, endpoint } = await startMockServer("mock reply here");
  try {
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 360, height: 600 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await configureProvider(panel, endpoint);

    await panel.getByRole("textbox", { name: /message/i }).fill("hello");
    await panel.getByRole("button", { name: /^send$/i }).click();
    await expect(panel.getByText("mock reply here")).toBeVisible();

    const metrics = await panel.evaluate(() => ({
      bodyMargin: getComputedStyle(document.body).margin,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      htmlScrollHeight: document.documentElement.scrollHeight,
      htmlClientHeight: document.documentElement.clientHeight,
    }));
    expect(metrics.bodyMargin).toBe("0px");
    expect(metrics.bodyScrollWidth).toBe(metrics.bodyClientWidth);
    expect(metrics.htmlScrollHeight).toBeLessThanOrEqual(metrics.htmlClientHeight + 1);

    await panel.getByRole("button", { name: /open conversations/i }).click();
    const listMetrics = await panel.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.body.clientWidth,
    }));
    expect(listMetrics.scrollWidth).toBe(listMetrics.clientWidth);
  } finally {
    server.close();
  }
});

test("layout: wide content never scrolls the message list", async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 360, height: 600 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  const wideImageBase64 = await panel.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.fillStyle = "#3366cc";
    ctx.fillRect(0, 0, 2000, 40);
    return canvas.toDataURL("image/png").split(",")[1];
  });

  await seedConversation(panel, [
    {
      id: "m-img",
      role: "user",
      parts: [{ type: "image", imageBase64: wideImageBase64, mimeType: "image/png" }],
      tabId: 1,
      createdAt: Date.now() - 2000,
    },
    {
      id: "m-long",
      role: "assistant",
      parts: [{ type: "text", text: `https://example.com/${"a".repeat(200)}` }],
      tabId: 1,
      createdAt: Date.now() - 1000,
    },
  ]);

  const img = panel.locator(".sancho-message img").first();
  await expect(img).toBeVisible();
  const sizes = await panel.evaluate(() => {
    const viewport = document.querySelector(".sancho-viewport");
    const message = document.querySelector(".sancho-message");
    const image = document.querySelector(".sancho-message img");
    if (!viewport || !message || !image) throw new Error("layout elements missing");
    return {
      viewportScrollWidth: viewport.scrollWidth,
      viewportClientWidth: viewport.clientWidth,
      imgWidth: image.getBoundingClientRect().width,
      messageWidth: message.getBoundingClientRect().width,
    };
  });
  expect(sizes.viewportScrollWidth).toBe(sizes.viewportClientWidth);
  expect(sizes.imgWidth).toBeLessThanOrEqual(sizes.messageWidth);
});

test("layout: composer keeps a bottom gap", async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 360, height: 600 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  const gap = await panel.evaluate(() => {
    const composer = document.querySelector(".sancho-composer");
    if (!composer) throw new Error("composer missing");
    return window.innerHeight - composer.getBoundingClientRect().bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(8);
});
