import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "../../src/ui/components/chat";
import { installMockPort, type MockPort } from "./helpers/mock-port";

describe("ChatPanel", () => {
  let port: MockPort;

  beforeEach(() => {
    port = installMockPort();
  });

  it("sends chat.send when the user submits a message", async () => {
    render(<ChatPanel tabId={7} />);
    const input = screen.getByRole("textbox", { name: /message/i });
    await userEvent.type(input, "hello agent");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(port.sent).toContainEqual(
      expect.objectContaining({
        type: "chat.send",
        payload: { text: "hello agent", tabId: 7 },
      }),
    );
  });

  it("renders streamed deltas as they arrive", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "chat.delta",
      id: "e1",
      payload: { messageId: "m1", text: "Hello" },
    });
    port.emit({
      kind: "event",
      type: "chat.delta",
      id: "e2",
      payload: { messageId: "m1", text: " there" },
    });

    await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());
  });

  it("shows a consent prompt when a screenshot requires consent", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "chat.tool",
      id: "e3",
      payload: {
        toolCall: { name: "captureScreenshot", arguments: {}, tabId: 7 },
        status: "started",
      },
    });
    port.emit({
      kind: "event",
      type: "chat.error",
      id: "e4",
      payload: { message: "consent_required" },
    });

    await waitFor(() => expect(screen.getByText(/allow screenshots/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /allow screenshots/i }));
    expect(port.sent).toContainEqual(
      expect.objectContaining({ type: "screenshot.consent", payload: { granted: true } }),
    );
  });

  it("renders tool call activity", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "chat.tool",
      id: "e5",
      payload: { toolCall: { name: "readPage", arguments: {}, tabId: 7 }, status: "started" },
    });
    await waitFor(() => expect(screen.getByText(/readPage/)).toBeInTheDocument());
  });

  it("surfaces errors in the thread", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "chat.error",
      id: "e6",
      payload: { message: "connection failed" },
    });
    await waitFor(() => expect(screen.getByText(/connection failed/)).toBeInTheDocument());
  });
});
