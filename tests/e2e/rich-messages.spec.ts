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
