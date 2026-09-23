import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Sancho",
    description: "AI agent sidebar for your browser",
    homepage_url: "https://github.com/fabiomontefuscolo/sancho",
    permissions: [
      "storage",
      "activeTab",
      "scripting",
      "contextMenus",
      "sidePanel",
      "nativeMessaging",
      "tabs",
      "webRequest",
    ],
    host_permissions: ["<all_urls>"],
    action: { default_title: "Open Sancho" },
  },
  runner: {
    disabled: true,
  },
});
