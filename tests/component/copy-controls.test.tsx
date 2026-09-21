import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function emitUserMessage(port: MockPort, id: string, text: string): void {
  port.emit({
    kind: "event",
    type: "conversation.state",
    id: "c1",
    payload: {
      id: "conv-1",
      title: "t",
      messages: [{ id, role: "user", parts: [{ type: "text", text }], tabId: 1, createdAt: 1 }],
      screenshotConsent: false,
      acpSessionId: null,
      createdAt: 1,
      updatedAt: 1,
    },
  });
}

function stubClipboard({ fail = false }: { fail?: boolean } = {}) {
  const writeText = fail
    ? vi.fn().mockRejectedValue(new Error("denied"))
    : vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

describe("copy controls", () => {
  let port: MockPort;

  beforeEach(() => {
    port = installMockPort();
  });

  it("copies exactly the code content from a code block", async () => {
    const writeText = stubClipboard();
    render(<ChatPanel tabId={7} />);
    emitAssistantMessage(port, "m1", "```typescript\nconst x = 1;\nconst y = 2;\n```");

    const header = await waitFor(() => {
      const el = document.querySelector(".sancho-code-header");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const button = header.querySelector("button") as HTMLButtonElement;
    await userEvent.click(button);

    expect(writeText).toHaveBeenCalledWith("const x = 1;\nconst y = 2;");
    await waitFor(() => expect(button.textContent).toBe("Copied"));
  });

  it("copies the raw markdown source of an agent message", async () => {
    const writeText = stubClipboard();
    const markdown = "## Title\n\n- one\n- two";
    render(<ChatPanel tabId={7} />);
    emitAssistantMessage(port, "m1", markdown);

    const button = await screen.findByRole("button", { name: /^copy$/i });
    await userEvent.click(button);

    expect(writeText).toHaveBeenCalledWith(markdown);
    await waitFor(() => expect(button).toHaveAttribute("data-copied", "true"));
  });

  it("regenerates an assistant reply from the action bar", async () => {
    stubClipboard();
    render(<ChatPanel tabId={7} />);
    emitAssistantMessage(port, "m1", "answer");

    const reload = await screen.findByRole("button", { name: /regenerate/i });
    await userEvent.click(reload);

    expect(port.sent).toContainEqual(expect.objectContaining({ type: "chat.regenerate" }));
  });

  it("user messages show copy but no regenerate", async () => {
    stubClipboard();
    render(<ChatPanel tabId={7} />);
    emitUserMessage(port, "u1", "question");

    expect(await screen.findByRole("button", { name: /^copy$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /regenerate/i })).toBeNull();
  });

  it("hides the action bar while a run is in progress", async () => {
    stubClipboard();
    render(<ChatPanel tabId={7} />);
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "go{Enter}");
    port.emit({
      kind: "event",
      type: "chat.delta",
      id: "r1",
      payload: { messageId: "m-run", text: "working" },
    });
    await waitFor(() => expect(screen.getByText("working")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /^copy$/i })).toBeNull();
  });
});
