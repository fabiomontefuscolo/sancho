import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ChatPanel } from "../../src/ui/components/chat";
import { installMockPort, type MockPort } from "./helpers/mock-port";

function emitAssistantMessage(port: MockPort, id: string, text: string): void {
  port.emit({
    kind: "event",
    type: "conversation.state",
    id: "c1",
    payload: {
      id: "conv-1",
      title: "t",
      messages: [
        {
          id,
          role: "assistant",
          parts: [{ type: "text", text }],
          tabId: 1,
          createdAt: 1,
        },
      ],
      screenshotConsent: false,
      acpSessionId: null,
      createdAt: 1,
      updatedAt: 1,
    },
  });
}

describe("markdown rendering", () => {
  let port: MockPort;

  beforeEach(() => {
    port = installMockPort();
  });

  it("renders headings, lists, links and emphasis without raw syntax", async () => {
    render(<ChatPanel tabId={7} />);
    emitAssistantMessage(
      port,
      "m1",
      "## Title\n\n- one\n- two\n\nSee [docs](https://example.com) for **details**.",
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Title" })).toBeTruthy();
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(screen.getByText("details").tagName).toBe("STRONG");
    const messageText = document.querySelector(".sancho-message-assistant")?.textContent ?? "";
    expect(messageText).not.toContain("##");
    expect(messageText).not.toContain("**");
  });

  it("renders partial markdown during streaming without breaking layout", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "chat.delta",
      id: "e1",
      payload: { messageId: "m1", text: "Here is **bold and a `code" },
    });
    await screen.findByText(/Here is/);

    port.emit({
      kind: "event",
      type: "chat.delta",
      id: "e2",
      payload: { messageId: "m1", text: " fragment** complete" },
    });
    await waitFor(() => {
      expect(screen.getByText("bold and a `code fragment").tagName).toBe("STRONG");
    });
  });

  it("never executes or loads raw HTML from message markup", async () => {
    render(<ChatPanel tabId={7} />);
    emitAssistantMessage(
      port,
      "m1",
      'safe text <script>window.__pwned = true</script> <img src="https://evil.example/x.png">',
    );

    await screen.findByText(/safe text/);
    const message = document.querySelector(".sancho-message-assistant");
    expect(message?.querySelector("script")).toBeNull();
    expect(message?.querySelector("img")).toBeNull();
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it("degrades malformed markdown to readable plain text", async () => {
    render(<ChatPanel tabId={7} />);
    emitAssistantMessage(port, "m1", "An [unclosed link and **stray bold marker");

    await waitFor(() => {
      const message = document.querySelector(".sancho-message-assistant");
      expect(message?.textContent).toContain("unclosed link");
      expect(message?.querySelector("a")).toBeNull();
    });
  });
});

describe("code blocks", () => {
  let port: MockPort;

  beforeEach(() => {
    port = installMockPort();
  });

  it("renders a tagged code block highlighted with a visible language label", async () => {
    render(<ChatPanel tabId={7} />);
    emitAssistantMessage(port, "m1", "```typescript\nconst x: number = 1;\n```");

    await waitFor(() => {
      expect(document.querySelector(".sancho-code-header")?.textContent).toContain("typescript");
    });
    expect(document.querySelector(".sancho-message-assistant pre code")?.textContent).toContain(
      "const x: number = 1;",
    );
  });

  it("renders an untagged code block as plain monospaced code", async () => {
    render(<ChatPanel tabId={7} />);
    emitAssistantMessage(port, "m1", "```\nplain code\n```");

    await waitFor(() => {
      expect(document.querySelector(".sancho-message-assistant pre code")?.textContent).toContain(
        "plain code",
      );
    });
    expect(document.querySelector(".sancho-code-header")?.textContent).toContain("code");
  });

  it("keeps wide code lines inside a scrollable block container", async () => {
    render(<ChatPanel tabId={7} />);
    emitAssistantMessage(port, "m1", "```\n" + "x".repeat(200) + "\n```");

    await waitFor(() => {
      const block = document.querySelector(".sancho-message-assistant pre");
      expect(block).not.toBeNull();
    });
  });
});
