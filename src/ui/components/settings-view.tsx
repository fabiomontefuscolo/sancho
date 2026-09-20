import type { FontSize, UiPrefs } from "../../types";

export function SettingsView({
  prefs,
  onFontSize,
  onBack,
}: {
  prefs: UiPrefs;
  onFontSize: (fontSize: FontSize) => void;
  onBack: () => void;
}) {
  return (
    <div className="sancho-settings">
      <div className="sancho-settings-header">
        <button aria-label="Back to chat" className="sancho-icon-button" onClick={onBack}>
          ←
        </button>
        <h2>Settings</h2>
      </div>
      <label className="sancho-settings-field">
        Font size
        <select
          value={prefs.fontSize}
          onChange={(event) => onFontSize(event.target.value as FontSize)}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </label>
    </div>
  );
}
