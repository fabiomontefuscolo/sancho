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
        payload: { text: "hello agent", tabId: 7, conversationId: "" },
      }),
    );
  });

  it("disables send while the composer is empty", async () => {
    render(<ChatPanel tabId={7} />);
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "hi");
    expect(screen.getByRole("button", { name: /send/i })).toBeEnabled();
  });

  it("sends on Enter and inserts a newline on Shift+Enter", async () => {
    render(<ChatPanel tabId={7} />);
    const input = screen.getByRole("textbox", { name: /message/i });
    await userEvent.type(input, "line one{Shift>}{Enter}{/Shift}line two");
    expect(input).toHaveValue("line one\nline two");
    await userEvent.type(input, "{Enter}");
    expect(port.sent).toContainEqual(
      expect.objectContaining({
        type: "chat.send",
        payload: expect.objectContaining({ text: "line one\nline two" }),
      }),
    );
  });

  it("shows a stop button while running and posts chat.cancel when clicked", async () => {
    render(<ChatPanel tabId={7} />);
    const input = screen.getByRole("textbox", { name: /message/i });
    await userEvent.type(input, "hello agent{Enter}");

    const stop = await screen.findByRole("button", { name: /stop/i });
    await userEvent.click(stop);
    expect(port.sent).toContainEqual(expect.objectContaining({ type: "chat.cancel" }));

    port.emit({
      kind: "event",
      type: "chat.done",
      id: "d1",
      payload: { messageId: "m-stop" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /stop/i })).toBeNull();
  });

  it("hides the empty pending assistant bubble until content arrives", async () => {
    render(<ChatPanel tabId={7} />);
    const input = screen.getByRole("textbox", { name: /message/i });
    await userEvent.type(input, "hello agent{Enter}");

    await waitFor(() =>
      expect(document.querySelector(".sancho-message-assistant")).toHaveClass(
        "sancho-message-pending",
      ),
    );

    port.emit({
      kind: "event",
      type: "chat.delta",
      id: "e1",
      payload: { messageId: "m1", text: "Hi" },
    });
    await screen.findByText("Hi");
    await waitFor(() =>
      expect(document.querySelector(".sancho-message-assistant")).not.toHaveClass(
        "sancho-message-pending",
      ),
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
        toolCallId: "tc-e3",
        toolName: "captureScreenshot",
        argsText: "{}",
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

  it("shows a diagnostics consent prompt distinct from the screenshot prompt", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "chat.tool",
      id: "e-diag",
      payload: {
        toolCallId: "tc-diag",
        toolName: "getConsoleMessages",
        argsText: "{}",
        status: "started",
      },
    });
    port.emit({
      kind: "event",
      type: "chat.error",
      id: "e-diag2",
      payload: { message: "diagnostics_consent_required" },
    });

    await waitFor(() => expect(screen.getByText(/allow page diagnostics/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /allow screenshots/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /allow page diagnostics/i }));
    expect(port.sent).toContainEqual(
      expect.objectContaining({ type: "diagnostics.consent", payload: { granted: true } }),
    );
  });

  it("renders tool call activity", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "chat.tool",
      id: "e5",
      payload: { toolCallId: "tc-e5", toolName: "readPage", argsText: "{}", status: "started" },
    });
    await waitFor(() => expect(screen.getByText(/readPage/)).toBeInTheDocument());
  });

  it("renders reasoning inside the collapsible thought process group", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "chat.delta",
      id: "r1",
      payload: { messageId: "m-r", text: "Let me think…", part: "reasoning" },
    });
    port.emit({
      kind: "event",
      type: "chat.delta",
      id: "r2",
      payload: { messageId: "m-r", text: "The answer." },
    });
    await waitFor(() => expect(screen.getByText("The answer.")).toBeInTheDocument());
    expect(screen.getByText(/thought process/i)).toBeInTheDocument();
    expect(screen.getByText("Let me think…")).toBeInTheDocument();
  });

  it("shows tool entries with running then done state inside the message", async () => {
    render(<ChatPanel tabId={7} />);
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "go{Enter}");
    port.emit({
      kind: "event",
      type: "chat.tool",
      id: "t1",
      payload: {
        messageId: "m-t",
        toolCallId: "tc-1",
        toolName: "readPage",
        argsText: "{}",
        status: "started",
      },
    });
    await waitFor(() => expect(screen.getByText(/readPage/)).toBeInTheDocument());
    expect(screen.getByText(/running/i)).toBeInTheDocument();
    port.emit({
      kind: "event",
      type: "chat.tool",
      id: "t2",
      payload: {
        messageId: "m-t",
        toolCallId: "tc-1",
        toolName: "readPage",
        argsText: "{}",
        result: '{"ok":true}',
        status: "finished",
      },
    });
    await waitFor(() => expect(screen.getByText(/done/i)).toBeInTheDocument());
  });

  it("shows no empty reasoning block when the model emits no reasoning", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "chat.tool",
      id: "t3",
      payload: {
        messageId: "m-nr",
        toolCallId: "tc-2",
        toolName: "readPage",
        argsText: "{}",
        status: "started",
      },
    });
    await waitFor(() => expect(screen.getByText(/readPage/)).toBeInTheDocument());
    expect(screen.queryByText(/thought process/i)).toBeInTheDocument();
    expect(document.querySelector(".sancho-reasoning")).toBeNull();
  });

  it("marks interrupted tool entries terminal on chat.done", async () => {
    render(<ChatPanel tabId={7} />);
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "go{Enter}");
    port.emit({
      kind: "event",
      type: "chat.tool",
      id: "t4",
      payload: {
        messageId: "m-i",
        toolCallId: "tc-3",
        toolName: "readPage",
        argsText: "{}",
        status: "started",
      },
    });
    await waitFor(() => expect(screen.getByText(/running/i)).toBeInTheDocument());
    port.emit({
      kind: "event",
      type: "chat.done",
      id: "t5",
      payload: { messageId: "m-i", cancelled: true },
    });
    await waitFor(() => expect(screen.queryByText(/running/i)).toBeNull());
  });

  it("drops the thought process when the conversation reloads", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "chat.tool",
      id: "t6",
      payload: {
        messageId: "m-h",
        toolCallId: "tc-4",
        toolName: "readPage",
        argsText: "{}",
        status: "started",
      },
    });
    await waitFor(() => expect(screen.getByText(/readPage/)).toBeInTheDocument());
    port.emit({
      kind: "event",
      type: "conversation.state",
      id: "t7",
      payload: {
        id: "c1",
        title: "Reloaded",
        messages: [
          {
            id: "m-h",
            role: "assistant",
            parts: [{ type: "text", text: "final text" }],
            tabId: 7,
            createdAt: 1,
          },
        ],
        screenshotConsent: false,
        acpSessionId: null,
        createdAt: 1,
        updatedAt: 1,
      },
    });
    await waitFor(() => expect(screen.getByText("final text")).toBeInTheDocument());
    expect(screen.queryByText(/thought process/i)).toBeNull();
  });

  it("surfaces errors as an alert notice on the failed message, not as chat text", async () => {
    render(<ChatPanel tabId={7} />);
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "go{Enter}");
    port.emit({
      kind: "event",
      type: "chat.delta",
      id: "e5a",
      payload: { messageId: "m-err", text: "partial" },
    });
    await waitFor(() => expect(screen.getByText("partial")).toBeInTheDocument());
    port.emit({
      kind: "event",
      type: "chat.error",
      id: "e6",
      payload: { message: "connection failed", messageId: "m-err" },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("connection failed");
    expect(screen.queryByText(/^Error: /)).toBeNull();
  });

  it("attaches pre-content errors to a placeholder assistant message", async () => {
    render(<ChatPanel tabId={7} />);
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "go{Enter}");
    port.emit({
      kind: "event",
      type: "chat.error",
      id: "e7",
      payload: { message: "provider exploded", messageId: "m-err2" },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("provider exploded");
  });

  it("shows ACP permission requests and resolves them with the chosen option", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "permission.request",
      id: "e7",
      payload: {
        requestId: "perm-1",
        title: "run shell command",
        options: [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
          { optionId: "allow-always", name: "Always allow", kind: "allow_always" },
        ],
      },
    });

    await waitFor(() => expect(screen.getByText(/run shell command/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Allow once" }));
    expect(port.sent).toContainEqual(
      expect.objectContaining({
        type: "permission.response",
        payload: { requestId: "perm-1", optionId: "allow-once" },
      }),
    );
    await waitFor(() => expect(screen.queryByText(/run shell command/)).not.toBeInTheDocument());
  });

  it("denies ACP permission requests via the Deny button", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "permission.request",
      id: "e8",
      payload: {
        requestId: "perm-2",
        title: "write file",
        options: [{ optionId: "allow-once", name: "Allow", kind: "allow_once" }],
      },
    });
    await waitFor(() => expect(screen.getByText(/write file/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(port.sent).toContainEqual(
      expect.objectContaining({
        type: "permission.response",
        payload: { requestId: "perm-2", optionId: null },
      }),
    );
  });
});

describe("agent activity status", () => {
  let port: MockPort;

  beforeEach(() => {
    port = installMockPort();
  });

  it("shows a thinking indicator while the run is planning and clears on done", async () => {
    render(<ChatPanel tabId={7} />);
    port.emit({
      kind: "event",
      type: "chat.state",
      id: "s1",
      payload: { state: "planning", conversationId: "" },
    });
    await screen.findByText("Thinking…");

    port.emit({
      kind: "event",
      type: "chat.state",
      id: "s2",
      payload: { state: "acting", conversationId: "" },
    });
    port.emit({
      kind: "event",
      type: "chat.tool",
      id: "s3",
      payload: { toolCallId: "tc-s3", toolName: "readPage", argsText: "{}", status: "started" },
    });
    await screen.findByText(/Working…/);

    port.emit({
      kind: "event",
      type: "chat.done",
      id: "s4",
      payload: { messageId: "m9" },
    });
    await waitFor(() => {
      expect(screen.queryByText(/Thinking|Working/)).toBeNull();
    });
  });
});
