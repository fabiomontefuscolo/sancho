export type RefResolution =
  { status: "ok"; element: Element } | { status: "stale" } | { status: "unknown" };

export interface RefRegistry {
  mintRef(element: Element): string;
  resolveRef(ref: string): RefResolution;
}

const REGISTRY_KEY = "__sanchoRefRegistry";

export function createRefRegistry(): RefRegistry {
  const byRef = new Map<string, WeakRef<Element>>();
  const byElement = new WeakMap<Element, string>();
  let counter = 0;

  return {
    mintRef(element: Element): string {
      const existing = byElement.get(element);
      if (existing) return existing;
      counter += 1;
      const ref = `e${counter}`;
      byRef.set(ref, new WeakRef(element));
      byElement.set(element, ref);
      return ref;
    },
    resolveRef(ref: string): RefResolution {
      const weak = byRef.get(ref);
      if (!weak) return { status: "unknown" };
      const element = weak.deref();
      if (!element || !element.isConnected) return { status: "stale" };
      return { status: "ok", element };
    },
  };
}

export function getSharedRefRegistry(scope: Record<string, unknown>): RefRegistry {
  const existing = scope[REGISTRY_KEY];
  if (existing) return existing as RefRegistry;
  const registry = createRefRegistry();
  scope[REGISTRY_KEY] = registry;
  return registry;
}
