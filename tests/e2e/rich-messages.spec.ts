import { expect, test } from "./fixtures";

async function seedConversation(
  panel: import("@playwright/test").Page,
  messages: unknown[],
): Promise<void> {
  await panel.evaluate(async (msgs) => {
    const now = Date.now();
    await chrome.storage.local.set({
      "conversation:rich-1": {
        id: "rich-1",
        title: "rich seed",
        messages: msgs,
        screenshotConsent: false,
        acpSessionId: null,
        createdAt: now,
        updatedAt: now,
      },
      "conversations.index": [
        {
          id: "rich-1",
          title: "rich seed",
          updatedAt: now,
          createdAt: now,
          messageCount: (msgs as unknown[]).length,
        },
      ],
      activeConversationId: "rich-1",
    });
  }, messages);
  await panel.reload();
}

function assistantMessage(id: string, text: string): unknown {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
    tabId: 1,
    createdAt: 1,
  };
}

test("code block copy yields exactly the code content", async ({ context, extensionId }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 360, height: 600 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await seedConversation(panel, [
    assistantMessage("m1", "```typescript\nconst x = 1;\nconst y = 2;\n```"),
  ]);

  const header = panel.locator(".sancho-code-header");
  await expect(header).toContainText("typescript");
  await header.getByRole("button").click();

  const clipboard = await panel.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe("const x = 1;\nconst y = 2;");
});

test("message copy yields the raw markdown source", async ({ context, extensionId }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 360, height: 600 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const markdown = "## Title\n\n- one\n- two";
  await seedConversation(panel, [assistantMessage("m1", markdown)]);

  await panel.getByRole("button", { name: /copy message/i }).click();

  const clipboard = await panel.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(markdown);
});

test("rendered markdown never scrolls the message list horizontally", async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 360, height: 600 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await seedConversation(panel, [
    assistantMessage("m1", "```\n" + "x".repeat(200) + "\n```"),
    assistantMessage("m2", "| " + "col |".repeat(20) + "\n|" + " --- |".repeat(20)),
  ]);

  await expect(panel.locator(".sancho-message-assistant pre").first()).toBeVisible();
  const metrics = await panel.evaluate(() => {
    const viewport = document.querySelector(".sancho-viewport");
    if (!viewport) throw new Error("viewport missing");
    return {
      viewportScrollWidth: viewport.scrollWidth,
      viewportClientWidth: viewport.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    };
  });
  expect(metrics.viewportScrollWidth).toBe(metrics.viewportClientWidth);
  expect(metrics.bodyScrollWidth).toBe(metrics.bodyClientWidth);
});

test("font size applies immediately, syncs, and persists across reload", async ({
  context,
  extensionId,
}) => {
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 360, height: 600 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await seedConversation(panel, [assistantMessage("m1", "some **markdown** text")]);

  await panel.getByRole("button", { name: /settings/i }).click();
  await panel.getByRole("combobox", { name: /font size/i }).selectOption("large");
  await panel.getByRole("button", { name: /back to chat/i }).click();

  await expect(panel.locator(".sancho-chat-root")).toHaveClass(/sancho-font-large/);

  await panel.reload();
  await expect(panel.locator(".sancho-chat-root")).toHaveClass(/sancho-font-large/);

  const metrics = await panel.evaluate(() => {
    const viewport = document.querySelector(".sancho-viewport");
    if (!viewport) throw new Error("viewport missing");
    return {
      scrollWidth: viewport.scrollWidth,
      clientWidth: viewport.clientWidth,
      timestamps: document.querySelectorAll(".sancho-message-time").length,
    };
  });
  expect(metrics.scrollWidth).toBe(metrics.clientWidth);
  expect(metrics.timestamps).toBe(1);
});

test("100 markdown-rich messages render under one second", async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 360, height: 600 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const messages = Array.from({ length: 100 }, (_, index) =>
    assistantMessage(
      `m${index}`,
      `## Heading ${index}\n\n- item one\n- item two\n\n\`\`\`typescript\nconst value${index}: number = ${index};\n\`\`\`\n\nSome **bold** and a [link](https://example.com).`,
    ),
  );
  await seedConversation(panel, messages);

  const renderMs = await panel.evaluate(async () => {
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const check = () => {
        if (document.querySelectorAll(".sancho-message").length >= 100) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
    return performance.now() - start;
  });
  await expect(panel.locator(".sancho-message")).toHaveCount(100);
  expect(renderMs).toBeLessThan(1000);

  const viewport = await panel.evaluate(() => {
    const el = document.querySelector(".sancho-viewport");
    if (!el) throw new Error("viewport missing");
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(viewport.scrollWidth).toBe(viewport.clientWidth);
});
