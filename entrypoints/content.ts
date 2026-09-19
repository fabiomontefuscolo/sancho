const GUARD_KEY = "__sanchoContentLoaded";

interface PageReadResult {
  title: string;
  url: string;
  chunks: string[];
}
interface OkResult {
  ok: boolean;
  error?: string;
}
interface SelectionInfo {
  text: string;
  editable: boolean;
}

const MAX_TOTAL_CHARS = 32_000;
const CHUNK_SIZE = 8_000;

function editableTargetOf(selection: Selection): HTMLElement | null {
  const node = selection.anchorNode;
  if (!node) return null;
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!element) return null;
  const editable = element.closest<HTMLElement>(
    "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, [contenteditable=true], [contenteditable='']",
  );
  return editable;
}

function getSelectionInfo(): SelectionInfo {
  const selection = window.getSelection();
  const text = selection?.toString() ?? "";
  const editable = selection ? editableTargetOf(selection) !== null : false;
  return { text, editable };
}

let lastEditableTarget: HTMLElement | null = null;

function replaceSelection(replacement: string): OkResult {
  const selection = window.getSelection();
  const target = selection ? editableTargetOf(selection) : null;
  const editable = target ?? lastEditableTarget;
  if (!editable) return { ok: false, error: "selection is not editable" };

  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
    const start = editable.selectionStart ?? 0;
    const end = editable.selectionEnd ?? start;
    const value = editable.value;
    editable.value = value.slice(0, start) + replacement + value.slice(end);
    editable.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: replacement }),
    );
    editable.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }

  if (editable.isContentEditable && selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(replacement));
    editable.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: replacement }),
    );
    return { ok: true };
  }

  return { ok: false, error: "unsupported editable element" };
}

function minifyPageText(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll("script, style, noscript, svg, canvas, iframe, nav, footer, header aside")
    .forEach((node) => node.remove());
  const text = clone.innerText ?? "";
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function chunkText(text: string): string[] {
  const limited = text.slice(0, MAX_TOTAL_CHARS);
  const chunks: string[] = [];
  for (let i = 0; i < limited.length; i += CHUNK_SIZE) {
    chunks.push(limited.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

function readPage(mode: "full" | "selection"): PageReadResult {
  if (mode === "selection") {
    const selection = window.getSelection()?.toString() ?? "";
    return { title: document.title, url: location.href, chunks: chunkText(selection) };
  }
  return { title: document.title, url: location.href, chunks: chunkText(minifyPageText()) };
}

function findElement(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function fillField(selector: string, value: string): OkResult {
  const element = findElement(selector);
  if (!element) return { ok: false, error: `no element matches ${selector}` };

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.focus();
    element.value = value;
    element.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
    );
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    element.focus();
    element.innerText = value;
    element.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
    );
    return { ok: true };
  }
  return { ok: false, error: "element is not fillable" };
}

function clickElement(selector: string): OkResult {
  const element = findElement(selector);
  if (!(element instanceof HTMLElement))
    return { ok: false, error: `no element matches ${selector}` };
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const init: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX, clientY };
  element.dispatchEvent(new MouseEvent("mouseover", init));
  element.dispatchEvent(new MouseEvent("mousedown", init));
  element.dispatchEvent(new MouseEvent("mouseup", init));
  element.dispatchEvent(new MouseEvent("click", init));
  return { ok: true };
}

function selectOption(selector: string, value: string): OkResult {
  const element = findElement(selector);
  if (!(element instanceof HTMLSelectElement)) {
    return { ok: false, error: `no <select> matches ${selector}` };
  }
  const option = Array.from(element.options).find(
    (candidate) => candidate.value === value || candidate.text === value,
  );
  if (!option) return { ok: false, error: `no option ${value}` };
  element.value = option.value;
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
}

function handleMessage(message: { type: string; [key: string]: unknown }): unknown {
  switch (message.type) {
    case "page.read":
      return readPage(message.mode === "selection" ? "selection" : "full");
    case "page.fill":
      return fillField(String(message.selector), String(message.value));
    case "page.click":
      return clickElement(String(message.selector));
    case "page.select":
      return selectOption(String(message.selector), String(message.value));
    case "selection.get": {
      const info = getSelectionInfo();
      const selection = window.getSelection();
      lastEditableTarget = selection ? editableTargetOf(selection) : null;
      return info;
    }
    case "selection.replace":
      return replaceSelection(String(message.replacement));
    default:
      return { ok: false, error: `unknown message type ${String(message.type)}` };
  }
}

export default defineContentScript({
  matches: ["<all_urls>"],
  registration: "runtime",
  main() {
    const globalScope = window as unknown as Record<string, unknown>;
    if (globalScope[GUARD_KEY]) return;
    globalScope[GUARD_KEY] = true;

    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (typeof message !== "object" || message === null || !("type" in message)) return false;
      try {
        sendResponse(handleMessage(message as { type: string }));
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    });
  },
});
