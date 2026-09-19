import { vi } from "vitest";

type ChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

export function installMockChrome() {
  const stores: { sync: Record<string, unknown>; local: Record<string, unknown> } = {
    sync: {},
    local: {},
  };
  const changeListeners: ChangeListener[] = [];

  const makeArea = (areaName: "sync" | "local") => {
    const store = stores[areaName];
    return {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (keys == null) return { ...store };
        const list = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const key of list) {
          if (key in store) out[key] = store[key];
        }
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
        for (const [key, value] of Object.entries(items)) {
          changes[key] = { oldValue: store[key], newValue: value };
          store[key] = value;
        }
        changeListeners.forEach((listener) => listener(changes, areaName));
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete store[key];
        }
      }),
    };
  };

  const chromeMock = {
    storage: {
      sync: makeArea("sync"),
      local: makeArea("local"),
      onChanged: {
        addListener: (listener: ChangeListener) => changeListeners.push(listener),
        removeListener: (listener: ChangeListener) => {
          const index = changeListeners.indexOf(listener);
          if (index >= 0) changeListeners.splice(index, 1);
        },
      },
    },
    scripting: {
      executeScript: vi.fn(async () => []),
    },
    tabs: {
      sendMessage: vi.fn(async (_tabId: number, message: { type: string }) => {
        if (message.type === "page.read") {
          return { title: "t", url: "https://x", chunks: ["text"] };
        }
        if (message.type === "selection.get") return { text: "sel", editable: true };
        return { ok: true };
      }),
      get: vi.fn(async () => ({ windowId: 1 })),
      query: vi.fn(async () => [{ id: 1, windowId: 1 }]),
      captureVisibleTab: vi.fn(async () => "data:image/png;base64,QUJD"),
    },
    contextMenus: {
      removeAll: vi.fn(async () => {}),
      create: vi.fn(),
      onClicked: { addListener: vi.fn() },
    },
    runtime: {
      onConnect: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      getPlatformInfo: vi.fn(async () => ({ os: "linux", arch: "x86-64", nacl_arch: "x86-64" })),
      connectNative: vi.fn(() => {
        throw new Error("Specified native messaging host not found.");
      }),
    },
  };

  vi.stubGlobal("chrome", chromeMock);
  return { stores, chromeMock };
}
