// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createRefRegistry, getSharedRefRegistry } from "../../src/content/refs";

describe("element reference registry", () => {
  it("mints sequential e<N> ids and is idempotent per element", () => {
    const registry = createRefRegistry();
    const a = document.createElement("button");
    const b = document.createElement("button");
    expect(registry.mintRef(a)).toBe("e1");
    expect(registry.mintRef(b)).toBe("e2");
    expect(registry.mintRef(a)).toBe("e1");
  });

  it("resolves a live element", () => {
    const registry = createRefRegistry();
    const el = document.createElement("button");
    document.body.appendChild(el);
    const ref = registry.mintRef(el);
    const result = registry.resolveRef(ref);
    expect(result).toEqual({ status: "ok", element: el });
    el.remove();
  });

  it("reports stale for a disconnected element", () => {
    const registry = createRefRegistry();
    const el = document.createElement("button");
    document.body.appendChild(el);
    const ref = registry.mintRef(el);
    el.remove();
    expect(registry.resolveRef(ref)).toEqual({ status: "stale" });
  });

  it("reports unknown for a ref that was never minted", () => {
    const registry = createRefRegistry();
    expect(registry.resolveRef("e99")).toEqual({ status: "unknown" });
  });

  it("shares one registry per scope via getSharedRefRegistry", () => {
    const scope: Record<string, unknown> = {};
    const first = getSharedRefRegistry(scope);
    const second = getSharedRefRegistry(scope);
    expect(first).toBe(second);
  });

  it("does not collide between separate registries", () => {
    const r1 = createRefRegistry();
    const r2 = createRefRegistry();
    const el = document.createElement("div");
    r1.mintRef(el);
    expect(r2.resolveRef("e1")).toEqual({ status: "unknown" });
  });
});
