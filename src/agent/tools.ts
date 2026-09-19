import { z } from "zod";
import type { ToolDefinition } from "../providers/base";
import { getConversation } from "../storage/local";
import { sendToContent } from "./inject";

export const readPageArgs = z.object({
  mode: z.enum(["full", "selection"]).default("full"),
});
export const fillFieldArgs = z.object({ selector: z.string(), value: z.string() });
export const clickElementArgs = z.object({ selector: z.string() });
export const selectOptionArgs = z.object({ selector: z.string(), value: z.string() });
export const captureScreenshotArgs = z.object({});

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "readPage",
    description:
      "Read the active tab's content as minified, chunked text. Use mode=selection to read only the current selection.",
    parameters: readPageArgs,
  },
  {
    name: "fillField",
    description:
      "Fill a text input, textarea, or contenteditable element identified by a CSS selector.",
    parameters: fillFieldArgs,
  },
  {
    name: "clickElement",
    description: "Click an element identified by a CSS selector.",
    parameters: clickElementArgs,
  },
  {
    name: "selectOption",
    description: "Select an option of a <select> element identified by a CSS selector.",
    parameters: selectOptionArgs,
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
    case "fillField":
      return sendToContent<typeof parsed, OkResult>(tabId, { type: "page.fill", ...parsed });
    case "clickElement":
      return sendToContent<typeof parsed, OkResult>(tabId, { type: "page.click", ...parsed });
    case "selectOption":
      return sendToContent<typeof parsed, OkResult>(tabId, { type: "page.select", ...parsed });
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
  const conversation = await getConversation();
  if (!conversation.screenshotConsent) {
    return { ok: false, error: "consent_required" };
  }
  const tab = await chrome.tabs.get(tabId);
  if (!tab.windowId) return { ok: false, error: "tab has no window" };
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const imageBase64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return { ok: true, imageBase64, mimeType: "image/png" };
}
