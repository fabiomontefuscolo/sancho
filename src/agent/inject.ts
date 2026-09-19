export class RestrictedPageError extends Error {
  constructor(tabId: number) {
    super(`page access unavailable on tab ${tabId}`);
    this.name = "RestrictedPageError";
  }
}

export async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-scripts/content.js"],
    });
  } catch {
    throw new RestrictedPageError(tabId);
  }
}

export async function sendToContent<TRequest, TResponse>(
  tabId: number,
  message: TRequest,
): Promise<TResponse> {
  await ensureContentScript(tabId);
  return (await chrome.tabs.sendMessage(tabId, message)) as TResponse;
}
