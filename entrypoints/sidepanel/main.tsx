import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChatPanel } from "../../src/ui/components/chat";

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? 0;
}

async function bootstrap() {
  const tabId = await getActiveTabId();
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("missing #root");
  createRoot(rootElement).render(
    <StrictMode>
      <ChatPanel tabId={tabId} />
    </StrictMode>,
  );
}

void bootstrap();
