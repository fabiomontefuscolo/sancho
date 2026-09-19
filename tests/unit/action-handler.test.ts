import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { BaseLLMProvider, type StreamEvents } from "../../src/providers/base";

vi.mock("../../src/providers/factory", async () => {
  const actual = await vi.importActual<typeof import("../../src/providers/factory")>(
    "../../src/providers/factory",
  );
  return { ...actual, createProvider: vi.fn() };
});

import { createProvider } from "../../src/providers/factory";
import { runActionById } from "../../src/agent/action-handler";
import {
  handleActionDelete,
  handleActionsList,
  handleActionUpsert,
} from "../../src/agent/settings-handler";
import { saveActions } from "../../src/storage/settings";
import type { AnyEnvelope } from "../../src/bridge/messages";
import type { Action } from "../../src/types";

class ReplyProvider extends BaseLLMProvider {
  readonly id = "reply";
  async streamChat(_m: never[], _t: never[], events: StreamEvents) {
    events.onDelta("improved");
    events.onDone();
  }
}

function makePort() {
  const posted: AnyEnvelope[] = [];
  return {
    posted,
    postMessage: (message: unknown) => posted.push(message as AnyEnvelope),
  } as unknown as chrome.runtime.Port & { posted: AnyEnvelope[] };
}

const custom: Action = {
  id: "c1",
  name: "Improve it",
  prompt: "Improve: {{selection}}",
  builtin: false,
  enabled: true,
};

describe("runActionById", () => {
  beforeEach(() => {
    installMockChrome();
    vi.mocked(createProvider).mockResolvedValue(new ReplyProvider());
  });

  it("runs an action and reports the replacement", async () => {
    await saveActions([custom]);
    const port = makePort();
    await runActionById("c1", 3, port);
    expect(
      port.posted.some(
        (envelope) =>
          envelope.type === "action.result" && envelope.payload.replacement === "improved",
      ),
    ).toBe(true);
  });

  it("reports unknown actions as errors", async () => {
    const port = makePort();
    await runActionById("missing", 3, port);
    expect(port.posted.some((envelope) => envelope.type === "chat.error")).toBe(true);
  });
});

describe("action settings handlers", () => {
  beforeEach(() => installMockChrome());

  it("lists, upserts, and deletes actions over the port", async () => {
    const port = makePort();
    await handleActionsList(port);
    expect(port.posted[0]).toMatchObject({ type: "actions.state", payload: [] });

    await handleActionUpsert(custom, port);
    const afterUpsert = port.posted.findLast((envelope) => envelope.type === "actions.state");
    expect(afterUpsert?.payload).toHaveLength(1);

    await handleActionDelete("c1", port);
    const afterDelete = port.posted.findLast((envelope) => envelope.type === "actions.state");
    expect(afterDelete?.payload).toHaveLength(0);
  });

  it("surfaces validation errors from upsert", async () => {
    const port = makePort();
    await handleActionUpsert({ ...custom, name: "" }, port);
    expect(port.posted.some((envelope) => envelope.type === "chat.error")).toBe(true);
  });
});
