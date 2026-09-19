import "@testing-library/jest-dom/vitest";

const nodeUint8Array = new TextEncoder().encode("").constructor as Uint8ArrayConstructor;
(globalThis as { Uint8Array: Uint8ArrayConstructor }).Uint8Array = nodeUint8Array;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;
