import { vi } from "vitest";

type ChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

export function installMockChrome() {
  const stores: Record<string, Record<string, unknown>> = { sync: {}, local: {} };
  const changeListeners: ChangeListener[] = [];

  const makeArea = (areaName: "sync" | "local") => ({
    get: vi.fn(async (keys?: string | string[] | null) => {
      const store = stores[areaName];
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
        changes[key] = { oldValue: stores[areaName][key], newValue: value };
        stores[areaName][key] = value;
      }
      changeListeners.forEach((listener) => listener(changes, areaName));
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete stores[areaName][key];
      }
    }),
  });

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
  };

  vi.stubGlobal("chrome", chromeMock);
  return { stores, chromeMock };
}
