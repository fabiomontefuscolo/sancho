export interface SetTextResult {
  ok: boolean;
  error?: string;
}

function isEditableElement(
  element: Element,
): element is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  const attr = element.getAttribute("contenteditable");
  return attr !== null && attr !== "false";
}

function selectAllIn(element: HTMLElement): void {
  const selection = element.ownerDocument.getSelection();
  if (!selection) return;
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setFormValue(element: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(element, text);
  } else {
    element.value = text;
  }
  element.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }),
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setEditableText(element: HTMLElement, text: string, mode: "replace" | "insert"): void {
  const before = element.textContent ?? "";
  if (mode === "replace") selectAllIn(element);
  const inputType = mode === "replace" ? "insertReplacementText" : "insertText";
  element.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType,
      data: text,
    }),
  );
  if (
    (element.textContent ?? "") === before &&
    mode === "replace" &&
    typeof document.execCommand === "function"
  ) {
    document.execCommand("insertText", false, text);
  }
}

export function setEditorText(
  element: Element,
  text: string,
  mode: "replace" | "insert",
): SetTextResult {
  if (!isEditableElement(element)) {
    return { ok: false, error: "target is not an editable element" };
  }
  element.focus();
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (mode === "insert") {
      const start = element.selectionStart ?? element.value.length;
      const end = element.selectionEnd ?? start;
      setFormValue(element, element.value.slice(0, start) + text + element.value.slice(end));
    } else {
      setFormValue(element, text);
    }
    return { ok: true };
  }
  setEditableText(element, text, mode);
  return { ok: true };
}
