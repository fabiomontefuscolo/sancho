import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "../../src/ui/components/chat";
import { installMockPort, type MockPort } from "./helpers/mock-port";

describe("reasoning via composer flow", () => {
  let port: MockPort;
  beforeEach(() => {
    port = installMockPort();
  });

  it("renders reasoning deltas after a composer send", async () => {
    render(<ChatPanel tabId={7} />);
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "think{Enter}");
    port.emit({
      kind: "event",
      type: "chat.delta",
      id: "r1",
      payload: { messageId: "m-r", text: "pondering deeply", part: "reasoning" },
    });
    port.emit({
      kind: "event",
      type: "chat.delta",
      id: "r2",
      payload: { messageId: "m-r", text: "final answer" },
    });
    await waitFor(() => expect(screen.getByText("final answer")).toBeInTheDocument());
    console.log(document.querySelector(".sancho-message-assistant")?.innerHTML);
    expect(screen.getByText("pondering deeply")).toBeInTheDocument();
  });
});
