import { z } from "zod";
import type { ToolDefinition } from "../providers/base";
import type { PageSnapshot } from "../content/snapshot";
import { getActiveConversation } from "../storage/conversations";
import { sendToContent } from "./inject";

export const readPageArgs = z.object({
  mode: z.enum(["full", "selection"]).default("full"),
});

const targetShape = { selector: z.string().optional(), ref: z.string().optional() };

function exactlyOneTarget(
  value: { selector?: string | undefined; ref?: string | undefined },
  ctx: z.RefinementCtx,
) {
  if (Boolean(value.selector) === Boolean(value.ref)) {
    ctx.addIssue({ code: "custom", message: "provide exactly one of selector or ref" });
  }
}

export const snapshotPageArgs = z.object({
  maxElements: z.number().int().positive().default(300),
});
export const fillFieldArgs = z
  .object({ ...targetShape, value: z.string() })
  .superRefine(exactlyOneTarget);
export const clickElementArgs = z.object({ ...targetShape }).superRefine(exactlyOneTarget);
export const selectOptionArgs = z
  .object({ ...targetShape, value: z.string() })
  .superRefine(exactlyOneTarget);
export const setEditorTextArgs = z
  .object({
    ...targetShape,
    text: z.string(),
    mode: z.enum(["replace", "insert"]).default("replace"),
  })
  .superRefine(exactlyOneTarget);
export const captureScreenshotArgs = z.object({});

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "readPage",
    description:
      "Read the active tab's content as minified, chunked text. Use mode=selection to read only the current selection.",
    parameters: readPageArgs,
  },
  {
    name: "snapshotPage",
    description:
      "Take a snapshot of the active tab's interactive elements (links, buttons, inputs, selects, textareas, editable regions) as a compact outline of role, accessible name, and a stable element reference (e.g. e3). ALWAYS snapshot before clicking, filling, selecting, or editing so you can target elements by reference instead of guessing selectors. References are valid until the page navigates.",
    parameters: snapshotPageArgs,
  },
  {
    name: "fillField",
    description:
      "Fill a text input, textarea, or contenteditable element. Target it by ref from snapshotPage (preferred) or by CSS selector.",
    parameters: fillFieldArgs,
  },
  {
    name: "clickElement",
    description:
      "Click an element. Target it by ref from snapshotPage (preferred) or by CSS selector.",
    parameters: clickElementArgs,
  },
  {
    name: "selectOption",
    description:
      "Select an option of a <select> element. Target it by ref from snapshotPage (preferred) or by CSS selector.",
    parameters: selectOptionArgs,
  },
  {
    name: "setEditorText",
    description:
      "Set text in an editable element: rich text/code editors (CodeMirror, Monaco, contenteditable) and plain inputs/textareas. mode=replace replaces all content; mode=insert inserts at the cursor. Target by ref from snapshotPage (preferred) or by CSS selector.",
    parameters: setEditorTextArgs,
  },
  {
    name: "captureScreenshot",
    description: "Capture the visible tab as an image for visual analysis. Requires user consent.",
    parameters: captureScreenshotArgs,
  },
];

const schemas: Record<string, z.ZodType> = Object.fromEntries(
  toolDefinitions.map((tool) => [tool.name, tool.parameters]),
);

export function validateToolArguments(name: string, args: unknown): Record<string, unknown> {
  const schema = schemas[name];
  if (!schema) throw new Error(`unknown tool: ${name}`);
  return schema.parse(args ?? {}) as Record<string, unknown>;
}

export interface PageReadResult {
  title: string;
  url: string;
  chunks: string[];
}
export interface OkResult {
  ok: boolean;
  error?: string;
}

export const MAX_CHUNK_CHARS = 8_000;

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  tabId: number,
): Promise<unknown> {
  const parsed = validateToolArguments(name, args);
  switch (name) {
    case "readPage":
      return sendToContent<typeof parsed, PageReadResult>(tabId, { type: "page.read", ...parsed });
    case "snapshotPage":
      return sendToContent<typeof parsed, PageSnapshot>(tabId, {
        type: "page.snapshot",
        ...parsed,
      });
    case "fillField":
      return sendToContent<typeof parsed, OkResult>(tabId, { type: "page.fill", ...parsed });
    case "clickElement":
      return sendToContent<typeof parsed, OkResult>(tabId, { type: "page.click", ...parsed });
    case "selectOption":
      return sendToContent<typeof parsed, OkResult>(tabId, { type: "page.select", ...parsed });
    case "setEditorText":
      return sendToContent<typeof parsed, OkResult>(tabId, { type: "page.setText", ...parsed });
    case "captureScreenshot":
      return captureScreenshot(tabId);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

export async function captureScreenshot(
  tabId: number,
): Promise<
  { ok: true; imageBase64: string; mimeType: "image/png" } | { ok: false; error: string }
> {
  const conversation = await getActiveConversation();
  if (!conversation.screenshotConsent) {
    return { ok: false, error: "consent_required" };
  }
  const tab = await chrome.tabs.get(tabId);
  if (!tab.windowId) return { ok: false, error: "tab has no window" };
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const imageBase64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return { ok: true, imageBase64, mimeType: "image/png" };
}
