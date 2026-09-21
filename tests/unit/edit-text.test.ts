// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { setEditorText, isCodeMirrorContent } from "../../src/content/edit-text";

function makeEditable(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("contenteditable", "true");
  el.textContent = "original text";
  document.body.appendChild(el);
  return el;
}

describe("setEditorText on contenteditable", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("replace mode dispatches a cancelable beforeinput insertReplacementText with the text", () => {
    const el = makeEditable();
    const events: InputEvent[] = [];
    el.addEventListener("beforeinput", (event) => events.push(event as InputEvent));
    const result = setEditorText(el, "new content", "replace");
    expect(result).toEqual({ ok: true });
    expect(events).toHaveLength(1);
    expect(events[0]!.inputType).toBe("insertReplacementText");
    expect(events[0]!.data).toBe("new content");
    expect(events[0]!.cancelable).toBe(true);
    expect(events[0]!.bubbles).toBe(true);
  });

  it("selects the full content before replacing", () => {
    const el = makeEditable();
    setEditorText(el, "new content", "replace");
    const selection = window.getSelection();
    expect(selection?.toString()).toBe("original text");
  });

  it("a host listener observing beforeinput sees replace semantics", () => {
    const el = makeEditable();
    let mirrored = "original text";
    el.addEventListener("beforeinput", (event) => {
      const input = event as InputEvent;
      if (input.inputType === "insertReplacementText") mirrored = input.data ?? "";
    });
    setEditorText(el, "host updated", "replace");
    expect(mirrored).toBe("host updated");
  });

  it("insert mode dispatches insertText and preserves surrounding content", () => {
    const el = makeEditable();
    const events: InputEvent[] = [];
    el.addEventListener("beforeinput", (event) => {
      const input = event as InputEvent;
      events.push(input);
      if (input.inputType === "insertText" && input.data) {
        el.textContent = (el.textContent ?? "") + input.data;
      }
    });
    const result = setEditorText(el, " appended", "insert");
    expect(result).toEqual({ ok: true });
    expect(events).toHaveLength(1);
    expect(events[0]!.inputType).toBe("insertText");
    expect(el.textContent).toBe("original text appended");
  });

  it("falls back to execCommand when beforeinput was ignored and content is unchanged", () => {
    const el = makeEditable();
    const calls: string[] = [];
    const original = Document.prototype.execCommand;
    Document.prototype.execCommand = ((command: string, _ui?: boolean, value?: string) => {
      calls.push(`${command}:${value ?? ""}`);
      if (command === "insertText") el.textContent = value ?? "";
      return true;
    }) as typeof Document.prototype.execCommand;
    try {
      const result = setEditorText(el, "via exec", "replace");
      expect(result).toEqual({ ok: true });
      expect(calls).toContain("insertText:via exec");
      expect(el.textContent).toBe("via exec");
    } finally {
      Document.prototype.execCommand = original;
    }
  });
});

describe("setEditorText on input and textarea", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("sets the value and fires bubbling input and change events", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const fired: string[] = [];
    input.addEventListener("input", (event) => {
      if (event.bubbles) fired.push("input");
    });
    input.addEventListener("change", (event) => {
      if (event.bubbles) fired.push("change");
    });
    const result = setEditorText(input, "typed value", "replace");
    expect(result).toEqual({ ok: true });
    expect(input.value).toBe("typed value");
    expect(fired).toEqual(["input", "change"]);
  });

  it("uses the prototype setter so framework overrides still fire", () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    const spy: string[] = [];
    Object.defineProperty(HTMLTextAreaElement.prototype, "value", {
      configurable: true,
      get() {
        return this.getAttribute("data-value") ?? "";
      },
      set(next: string) {
        spy.push(next);
        this.setAttribute("data-value", next);
      },
    });
    try {
      setEditorText(textarea, "framework value", "replace");
      expect(spy).toEqual(["framework value"]);
    } finally {
      delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).value;
    }
  });
});

describe("setEditorText errors", () => {
  it("rejects an element that is not editable", () => {
    document.body.innerHTML = "";
    const div = document.createElement("div");
    document.body.appendChild(div);
    const result = setEditorText(div, "x", "replace");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(div.textContent).toBe("");
  });
});

describe("isCodeMirrorContent", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("detects a cm-content element", () => {
    const el = document.createElement("div");
    el.classList.add("cm-content");
    document.body.appendChild(el);
    expect(isCodeMirrorContent(el)).toBe(true);
  });

  it("detects a descendant of a cm-editor", () => {
    const wrapper = document.createElement("div");
    wrapper.classList.add("cm-editor");
    const inner = document.createElement("div");
    wrapper.appendChild(inner);
    document.body.appendChild(wrapper);
    expect(isCodeMirrorContent(inner)).toBe(true);
  });

  it("returns false for plain contenteditable and inputs", () => {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "true");
    document.body.appendChild(el);
    expect(isCodeMirrorContent(el)).toBe(false);
    expect(isCodeMirrorContent(document.createElement("input"))).toBe(false);
  });
});
