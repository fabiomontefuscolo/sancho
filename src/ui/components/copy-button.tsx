import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

type CopyState = "idle" | "copied" | "failed";

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through to legacy path
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const ok = document.execCommand("copy");
    if (!ok) throw new Error("execCommand copy returned false");
  } finally {
    textarea.remove();
  }
}

export function CopyButton({
  getText,
  className,
  label = "Copy",
}: {
  getText: () => string;
  className?: string;
  label?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onClick = async () => {
    try {
      await writeClipboard(getText());
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1500);
  };

  const text = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label;

  return (
    <button
      type="button"
      className={`sancho-copy-button ${className ?? ""}`.trim()}
      data-state={state}
      data-copied={state === "copied" ? "true" : undefined}
      onClick={onClick}
      aria-label={text}
    >
      <Copy size={13} className="sancho-icon-copy" />
      <Check size={13} className="sancho-icon-copied" />
    </button>
  );
}
