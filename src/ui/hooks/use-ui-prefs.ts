import { useEffect, useState } from "react";
import type { FontSize, UiPrefs } from "../../types";
import {
  DEFAULT_UI_PREFS,
  getUiPrefs,
  onUiPrefsChanged,
  saveUiPrefs,
} from "../../storage/settings";

export function useUiPrefs(): { prefs: UiPrefs; setFontSize: (fontSize: FontSize) => void } {
  const [prefs, setPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) return;
    let active = true;
    void getUiPrefs().then((stored) => {
      if (active) setPrefs(stored);
    });
    const unsubscribe = onUiPrefsChanged((next) => {
      if (active) setPrefs(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const setFontSize = (fontSize: FontSize) => {
    setPrefs({ fontSize });
    void saveUiPrefs({ fontSize });
  };

  return { prefs, setFontSize };
}
