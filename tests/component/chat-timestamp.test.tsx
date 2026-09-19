import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ChatPanel } from "../../src/ui/components/chat";
import { installMockPort, type MockPort } from "./helpers/mock-port";
import { formatMessageTime } from "../../src/ui/utils/format-time";

function emitConversation(port: MockPort, messages: unknown[]): void {
  port.emit({
    kind: "event",
    type: "conversation.state",
    id: "c1",
    payload: {
      id: "conv-1",
      title: "t",
      messages,
      screenshotConsent: false,
      acpSessionId: null,
      createdAt: 1,
      updatedAt: 1,
    },
  });
}

describe("message timestamps", () => {
  let port: MockPort;

  beforeEach(() => {
    port = installMockPort();
  });

  it("renders timestamps on user and assistant messages", async () => {
    render(<ChatPanel tabId={7} />);
    const userTime = new Date(2026, 8, 19, 22, 56).getTime();
    const assistantTime = userTime + 60_000;
    emitConversation(port, [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
        tabId: 1,
        createdAt: userTime,
      },
      {
        id: "m2",
        role: "assistant",
        parts: [{ type: "text", text: "hi there" }],
        tabId: 1,
        createdAt: assistantTime,
      },
    ]);

    await waitFor(() => {
      const labels = document.querySelectorAll(".sancho-message-time");
      expect(labels).toHaveLength(2);
      expect(labels[0].textContent).toMatch(/\w{3} \w{3} \d{1,2} \d{2}:\d{2}/);
      expect(labels[0].textContent).toBe(formatMessageTime(userTime));
      expect(labels[1].textContent).toBe(formatMessageTime(assistantTime));
    });
  });

  it("renders no timestamp when the record has no createdAt", async () => {
    render(<ChatPanel tabId={7} />);
    emitConversation(port, [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "legacy message" }],
        tabId: 1,
      },
    ]);

    await screen.findByText("legacy message");
    expect(document.querySelectorAll(".sancho-message-time")).toHaveLength(0);
  });

  it("formatMessageTime produces the Sat Sep 19 22:56 shape", () => {
    const epoch = new Date(2026, 8, 19, 22, 56).getTime();
    expect(formatMessageTime(epoch)).toMatch(/^Sat Sep 19 22:56$/);
  });
});
