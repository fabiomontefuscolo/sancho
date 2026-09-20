import type { FC } from "react";
import { makePrismAsyncLightSyntaxHighlighter } from "@assistant-ui/react-syntax-highlighter";
import type { CodeHeaderProps } from "@assistant-ui/react-markdown";
import { CopyButton } from "./copy-button";

export const SyntaxHighlighter = makePrismAsyncLightSyntaxHighlighter({
  customStyle: { margin: 0, background: "transparent", fontSize: "inherit" },
});

export const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  return (
    <div className="sancho-code-header">
      <span className="sancho-code-language">
        {language && language !== "unknown" ? language : "code"}
      </span>
      <CopyButton getText={() => code.replace(/\n$/, "")} label="Copy" />
    </div>
  );
};
