import { useEffect, useRef, useState } from "react";
import {
  MAX_CUSTOM_INSTRUCTIONS,
  getCustomInstructions,
  onCustomInstructionsChanged,
  saveCustomInstructions,
} from "../../storage/settings";

const SAVE_DEBOUNCE_MS = 600;

export function CustomInstructionsSection() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void getCustomInstructions().then((stored) => {
      if (active) setText(stored);
    });
    const unsubscribe = onCustomInstructionsChanged((stored) => {
      if (active) setText(stored);
    });
    return () => {
      active = false;
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const persist = (value: string) => {
    void saveCustomInstructions(value).then(() => {
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    });
  };

  const scheduleSave = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(value), SAVE_DEBOUNCE_MS);
  };

  const changeText = (value: string) => {
    setText(value);
    setSaved(false);
    scheduleSave(value);
  };

  const blurText = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      persist(text);
    }
  };

  return (
    <section aria-label="Custom instructions" className="options-section">
      <h2>Custom instructions</h2>
      <div className="settings-grid">
        <label htmlFor="custom-instructions">
          Instructions the agent follows in every chat, like an AGENTS.md file.
        </label>
        <textarea
          id="custom-instructions"
          aria-label="Custom instructions"
          maxLength={MAX_CUSTOM_INSTRUCTIONS}
          rows={6}
          value={text}
          onChange={(event) => changeText(event.target.value)}
          onBlur={blurText}
          placeholder="e.g. Always reply in Portuguese. Be terse."
        />
        <div className="custom-instructions-footer">
          <span className="custom-instructions-counter">
            {text.length} / {MAX_CUSTOM_INSTRUCTIONS}
          </span>
          <span className="saved-indicator" role="status">
            {saved ? "Saved" : ""}
          </span>
        </div>
      </div>
    </section>
  );
}
