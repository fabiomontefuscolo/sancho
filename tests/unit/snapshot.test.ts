// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { buildSnapshot, computeRole, accessibleName } from "../../src/content/snapshot";
import { createRefRegistry } from "../../src/content/refs";

function fresh() {
  document.body.innerHTML = "";
  return createRefRegistry();
}

describe("buildSnapshot", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("collects interactive elements with role and accessible name", () => {
    const registry = fresh();
    document.body.innerHTML = `
      <button>Save changes</button>
      <a href="/docs">Read the docs</a>
      <input type="text" placeholder="Your name">
      <select><option>One</option></select>
      <textarea aria-label="Notes"></textarea>
    `;
    const snapshot = buildSnapshot(300, registry, document);
    const roles = snapshot.elements.map((e) => e.role);
    expect(roles).toEqual(["button", "link", "textbox", "combobox", "textbox"]);
    expect(snapshot.elements[0]!.name).toBe("Save changes");
    expect(snapshot.elements[1]!.name).toBe("Read the docs");
    expect(snapshot.elements[2]!.name).toBe("Your name");
    expect(snapshot.elements[4]!.name).toBe("Notes");
    expect(snapshot.elements.every((e) => /^e\d+$/.test(e.ref))).toBe(true);
    expect(snapshot.truncated).toBe(0);
  });

  it("prefers aria-label over text content and resolves aria-labelledby", () => {
    const registry = fresh();
    document.body.innerHTML = `
      <button aria-label="Close dialog">X</button>
      <span id="lbl">From label element</span>
      <button aria-labelledby="lbl">ignored text</button>
    `;
    const snapshot = buildSnapshot(300, registry, document);
    expect(snapshot.elements[0]!.name).toBe("Close dialog");
    expect(snapshot.elements[1]!.name).toBe("From label element");
  });

  it("uses the associated <label> for form fields", () => {
    const registry = fresh();
    document.body.innerHTML = `
      <label for="email">Email address</label>
      <input id="email" type="email">
      <label>Wrapped <input type="text"></label>
    `;
    const snapshot = buildSnapshot(300, registry, document);
    expect(snapshot.elements[0]!.name).toBe("Email address");
    expect(snapshot.elements[1]!.name).toBe("Wrapped");
  });

  it("omits non-interactive noise", () => {
    const registry = fresh();
    document.body.innerHTML = `
      <div>plain text</div>
      <span>more text</span>
      <p>a paragraph</p>
      <button>Only me</button>
    `;
    const snapshot = buildSnapshot(300, registry, document);
    expect(snapshot.elements).toHaveLength(1);
    expect(snapshot.elements[0]!.name).toBe("Only me");
  });

  it("includes role=button and tabindex elements but not tabindex=-1", () => {
    const registry = fresh();
    document.body.innerHTML = `
      <div role="button" tabindex="0">Custom</div>
      <div tabindex="0">Focusable</div>
      <div tabindex="-1">Not tabbable</div>
    `;
    const snapshot = buildSnapshot(300, registry, document);
    expect(snapshot.elements.map((e) => [e.role, e.name])).toEqual([
      ["button", "Custom"],
      ["generic", "Focusable"],
    ]);
  });

  it("never exposes password values", () => {
    const registry = fresh();
    document.body.innerHTML = `
      <label for="pw">Password</label>
      <input id="pw" type="password" value="s3cret-hunter2">
    `;
    const snapshot = buildSnapshot(300, registry, document);
    expect(snapshot.elements).toHaveLength(1);
    expect(snapshot.elements[0]!.role).toBe("textbox");
    expect(snapshot.elements[0]!.name).toBe("Password");
    expect(JSON.stringify(snapshot)).not.toContain("s3cret-hunter2");
  });

  it("caps output at maxElements and reports the truncation count", () => {
    const registry = fresh();
    document.body.innerHTML = Array.from({ length: 10 }, (_, i) => `<button>B${i}</button>`).join(
      "",
    );
    const snapshot = buildSnapshot(3, registry, document);
    expect(snapshot.elements).toHaveLength(3);
    expect(snapshot.truncated).toBe(7);
  });

  it("truncates long names to 80 characters", () => {
    const registry = fresh();
    const long = "x".repeat(200);
    document.body.innerHTML = `<button>${long}</button>`;
    const snapshot = buildSnapshot(300, registry, document);
    expect(snapshot.elements[0]!.name.length).toBe(80);
  });

  it("pierces open shadow roots", () => {
    const registry = fresh();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<button>Inside shadow</button>`;
    const snapshot = buildSnapshot(300, registry, document);
    expect(snapshot.elements.map((e) => e.name)).toContain("Inside shadow");
  });

  it("marks same-origin iframe entries with their frame", () => {
    const registry = fresh();
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const inner = iframe.contentDocument;
    expect(inner).not.toBeNull();
    inner!.body.innerHTML = `<button>Framed</button>`;
    const snapshot = buildSnapshot(300, registry, document);
    const framed = snapshot.elements.find((e) => e.name === "Framed");
    expect(framed?.frame).toBe("[frame 1]");
  });

  it("emits one inaccessible marker line for a cross-origin frame", () => {
    const registry = fresh();
    const iframe = document.createElement("iframe");
    Object.defineProperty(iframe, "contentDocument", {
      get() {
        throw new Error("blocked a frame with origin");
      },
    });
    document.body.appendChild(iframe);
    const snapshot = buildSnapshot(300, registry, document);
    const markers = snapshot.elements.filter((e) => e.role === "frame");
    expect(markers).toHaveLength(1);
    expect(markers[0]!.name).toBe("inaccessible");
    expect(markers[0]!.frame).toBe("[frame 1]");
    expect(markers[0]!.ref).toBe("");
  });
});

describe("computeRole and accessibleName helpers", () => {
  it("maps implicit roles", () => {
    document.body.innerHTML = `
      <a href="/x">l</a>
      <input type="checkbox">
      <input type="radio">
      <input type="submit" value="Go">
      <select></select>
      <summary>s</summary>
      <div contenteditable="true"></div>
    `;
    const els = Array.from(document.body.children);
    expect(els.map(computeRole)).toEqual([
      "link",
      "checkbox",
      "radio",
      "button",
      "combobox",
      "button",
      "textbox",
    ]);
  });

  it("falls back to title and alt", () => {
    document.body.innerHTML = `
      <button title="tip"></button>
      <input type="image" alt="send icon">
    `;
    const els = Array.from(document.body.children);
    expect(accessibleName(els[0]!)).toBe("tip");
    expect(accessibleName(els[1]!)).toBe("send icon");
  });
});
