import { useEffect, useState } from "react";
import type { FontSize } from "../../types";
import {
  DEFAULT_UI_PREFS,
  getUiPrefs,
  onUiPrefsChanged,
  saveUiPrefs,
} from "../../storage/settings";

export function AppearanceSection() {
  const [fontSize, setFontSize] = useState<FontSize>(DEFAULT_UI_PREFS.fontSize);

  useEffect(() => {
    let active = true;
    void getUiPrefs().then((prefs) => {
      if (active) setFontSize(prefs.fontSize);
    });
    const unsubscribe = onUiPrefsChanged((prefs) => {
      if (active) setFontSize(prefs.fontSize);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const changeFontSize = (next: FontSize) => {
    setFontSize(next);
    void saveUiPrefs({ fontSize: next });
  };

  return (
    <section aria-label="Appearance" className="options-section">
      <h2>Appearance</h2>
      <div className="settings-grid">
        <label>
          Message font size
          <select
            value={fontSize}
            onChange={(event) => changeFontSize(event.target.value as FontSize)}
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
      </div>
    </section>
  );
}
