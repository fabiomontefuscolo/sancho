import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Sancho",
    description: "AI agent sidebar for your browser",
    permissions: ["storage", "activeTab", "scripting", "contextMenus", "sidePanel", "nativeMessaging", "tabs"],
    host_permissions: [],
  },
});
