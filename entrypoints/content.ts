const GUARD_KEY = "__sanchoContentLoaded";

import { getSharedRefRegistry } from "../src/content/refs";
import { buildSnapshot, computeRole, accessibleName } from "../src/content/snapshot";
import { setEditorText, isCodeMirrorContent } from "../src/content/edit-text";

const refRegistry = getSharedRefRegistry(globalThis as unknown as Record<string, unknown>);

interface PageReadResult {
  title: string;
  url: string;
  chunks: string[];
}
interface OkResult {
  ok: boolean;
  error?: string;
  role?: string;
  name?: string;
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
  const active = document.activeElement;
  if (
    (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
    active.selectionStart !== null &&
    active.selectionEnd !== null &&
    active.selectionEnd > active.selectionStart
  ) {
    return { text: active.value.slice(active.selectionStart, active.selectionEnd), editable: true };
  }
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

type TargetResolution = { element: Element } | { failure: OkResult };

function resolveTarget(message: { [key: string]: unknown }): TargetResolution {
  if (typeof message.ref === "string" && message.ref) {
    const resolution = refRegistry.resolveRef(message.ref);
    if (resolution.status === "ok") return { element: resolution.element };
    return { failure: { ok: false, error: "stale reference" } };
  }
  const selector = String(message.selector);
  const element = findElement(selector);
  if (!element) return { failure: { ok: false, error: `no element matches ${selector}` } };
  return { element };
}

function narrated(element: Element, result: OkResult): OkResult {
  if (!result.ok) return result;
  return { ...result, role: computeRole(element), name: accessibleName(element) };
}

function fillElement(element: Element, value: string): OkResult {
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

function clickElementOn(element: Element): OkResult {
  if (!(element instanceof HTMLElement)) return { ok: false, error: "element is not clickable" };
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

function selectOptionOn(element: Element, value: string): OkResult {
  if (!(element instanceof HTMLSelectElement)) {
    return { ok: false, error: "element is not a <select>" };
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
    case "page.snapshot":
      return buildSnapshot(
        typeof message.maxElements === "number" ? message.maxElements : 300,
        refRegistry,
        document,
      );
    case "page.fill": {
      const target = resolveTarget(message);
      if ("failure" in target) return target.failure;
      return narrated(target.element, fillElement(target.element, String(message.value)));
    }
    case "page.click": {
      const target = resolveTarget(message);
      if ("failure" in target) return target.failure;
      return narrated(target.element, clickElementOn(target.element));
    }
    case "page.select": {
      const target = resolveTarget(message);
      if ("failure" in target) return target.failure;
      return narrated(target.element, selectOptionOn(target.element, String(message.value)));
    }
    case "page.setText": {
      const target = resolveTarget(message);
      if ("failure" in target) return target.failure;
      const mode = message.mode === "insert" ? "insert" : "replace";
      if (isCodeMirrorContent(target.element)) {
        return setCodeMirrorTextViaMainWorld(target.element, String(message.text), mode).then(
          (result) => narrated(target.element, result),
        );
      }
      return narrated(target.element, setEditorText(target.element, String(message.text), mode));
    }
    case "selection.get": {
      const info = getSelectionInfo();
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        lastEditableTarget = active.selectionEnd !== active.selectionStart ? active : null;
      } else {
        const selection = window.getSelection();
        lastEditableTarget = selection ? editableTargetOf(selection) : null;
      }
      return info;
    }
    case "selection.replace":
      return replaceSelection(String(message.replacement));
    case "console.read":
      return readConsoleFromProbe();
    default:
      return { ok: false, error: `unknown message type ${String(message.type)}` };
  }
}

interface ProbeConsoleEntry {
  level: "log" | "info" | "warn" | "error" | "exception";
  text: string;
  timestamp: number;
}

function readConsoleFromProbe(): Promise<{
  ok: boolean;
  entries: ProbeConsoleEntry[];
  note?: string;
}> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ ok: true, entries: [], note: "probe unavailable" });
    }, 2000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as {
        source?: string;
        type?: string;
        entries?: ProbeConsoleEntry[];
      } | null;
      if (data?.source !== "sancho-diag-probe" || data.type !== "console.entries") return;
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve({ ok: true, entries: Array.isArray(data.entries) ? data.entries : [] });
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "sancho-diag", type: "console.read" });
  });
}

async function setCodeMirrorTextViaMainWorld(
  element: Element,
  text: string,
  mode: "replace" | "insert",
): Promise<OkResult> {
  const marker = crypto.randomUUID();
  element.setAttribute("data-sancho-cm", marker);
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "sancho:cmSetText",
      marker,
      text,
      mode,
    })) as OkResult | undefined;
    if (!response || typeof response !== "object") {
      return { ok: false, error: "no response from background for CodeMirror edit" };
    }
    return response;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    element.removeAttribute("data-sancho-cm");
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
        const result = handleMessage(message as { type: string }) as unknown;
        if (result instanceof Promise) {
          result.then(
            (resolved) => sendResponse(resolved),
            (error: unknown) =>
              sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              }),
          );
        } else {
          sendResponse(result);
        }
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    });
  },
});
