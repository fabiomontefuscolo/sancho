import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatPanel } from "../../src/ui/components/chat";

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? 0;
}

function SidePanelApp() {
  const [tabId, setTabId] = useState<number>(0);

  useEffect(() => {
    void getActiveTabId().then(setTabId);
    const onActivated = (info: chrome.tabs.TabActiveInfo) => setTabId(info.tabId);
    const onUpdated = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (tab.active && changeInfo.status === "complete") setTabId(updatedTabId);
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return <ChatPanel tabId={tabId} />;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("missing #root");
createRoot(rootElement).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>,
);
