import { getSharedRefRegistry, type RefRegistry } from "./refs";

export interface SnapshotEntry {
  ref: string;
  role: string;
  name: string;
  frame: string | null;
}

export interface PageSnapshot {
  elements: SnapshotEntry[];
  truncated: number;
}

const MAX_NAME_LENGTH = 80;

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[contenteditable]",
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="textbox"]',
  '[role="combobox"]',
  "[tabindex]",
].join(",");

export function computeRole(element: Element): string {
  const explicit = element.getAttribute("role");
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button" || tag === "summary") return "button";
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";
  if (tag === "input") {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (["button", "submit", "reset", "image"].includes(type)) return "button";
    return "textbox";
  }
  const editable = element.getAttribute("contenteditable");
  if (editable !== null && editable !== "false") return "textbox";
  return "generic";
}

function labeledByText(element: Element): string | null {
  const ids = element.getAttribute("aria-labelledby");
  if (!ids) return null;
  const doc = element.ownerDocument;
  const text = ids
    .split(/\s+/)
    .map((id) => doc.getElementById(id)?.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return text || null;
}

function labelText(element: Element): string | null {
  if (!(
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )) {
    return null;
  }
  if (element.id) {
    const explicit = element.ownerDocument.querySelector(`label[for="${element.id}"]`);
    if (explicit?.textContent?.trim()) return explicit.textContent.trim();
  }
  const wrapping = element.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, textarea, select").forEach((node) => node.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }
  return null;
}

export function accessibleName(element: Element): string {
  const sources: (string | null)[] = [
    element.getAttribute("aria-label"),
    labeledByText(element),
    labelText(element),
    element.textContent,
  ];
  if (element instanceof HTMLInputElement) {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    if (["button", "submit", "reset", "image"].includes(type)) sources.push(element.value);
    sources.push(element.placeholder);
  }
  if (element instanceof HTMLTextAreaElement) sources.push(element.placeholder);
  sources.push(element.getAttribute("title"), element.getAttribute("alt"));
  for (const source of sources) {
    const trimmed = source?.replace(/\s+/g, " ").trim() ?? "";
    if (trimmed) return trimmed.slice(0, MAX_NAME_LENGTH);
  }
  return "";
}

function isInteractiveCandidate(element: Element): boolean {
  if (element.getAttribute("contenteditable") === "false") return false;
  const tabindex = element.getAttribute("tabindex");
  if (tabindex !== null && Number(tabindex) < 0) return false;
  return true;
}

export function buildSnapshot(
  maxElements = 300,
  registry: RefRegistry = getSharedRefRegistry(globalThis as unknown as Record<string, unknown>),
  root: Document = document,
): PageSnapshot {
  const elements: SnapshotEntry[] = [];
  let truncated = 0;
  let frameIndex = 0;

  const collect = (scope: Document | ShadowRoot, frame: string | null): void => {
    for (const element of scope.querySelectorAll(INTERACTIVE_SELECTOR)) {
      if (!isInteractiveCandidate(element)) continue;
      if (elements.length >= maxElements) {
        truncated += 1;
        continue;
      }
      elements.push({
        ref: registry.mintRef(element),
        role: computeRole(element),
        name: accessibleName(element),
        frame,
      });
    }
    for (const element of scope.querySelectorAll("*")) {
      if (element.shadowRoot) collect(element.shadowRoot, frame);
      if (element instanceof HTMLIFrameElement) {
        frameIndex += 1;
        const frameLabel = `[frame ${frameIndex}]`;
        try {
          const inner = element.contentDocument;
          if (inner) collect(inner, frameLabel);
        } catch {
          elements.push({ ref: "", role: "frame", name: "inaccessible", frame: frameLabel });
        }
      }
    }
  };

  collect(root, null);
  return { elements, truncated };
}
