import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { CodeHeader, SyntaxHighlighter } from "./code-block";

export function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      components={{ SyntaxHighlighter, CodeHeader }}
    />
  );
}
