import { useState, isValidElement, type ReactElement, type ReactNode } from "react";

type CodeProps = {
  className?: string;
  children?: ReactNode;
};

function collectText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return collectText(node.props.children);
  }
  return "";
}

function extractCode(children: ReactNode): { lang: string; text: string; codeEl: ReactNode } {
  const child = Array.isArray(children) ? children[0] : children;
  if (!isValidElement(child)) {
    return { lang: "", text: collectText(children).replace(/\n$/, ""), codeEl: children };
  }

  const el = child as ReactElement<CodeProps>;
  const className = String(el.props.className ?? "");
  const lang = /language-([\w+-]+)/.exec(className)?.[1] ?? "";
  const text = collectText(el.props.children).replace(/\n$/, "");
  return { lang, text, codeEl: child };
}

export function CodeBlock({ children }: { children?: ReactNode }) {
  const { lang, text, codeEl } = extractCode(children);
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (permissions / insecure context).
    }
  }

  return (
    <div className="message-codeblock">
      <div className="message-codeblock-bar">
        <span className="message-codeblock-lang">{lang || "text"}</span>
        <button
          type="button"
          className="message-codeblock-copy"
          onClick={onCopy}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{codeEl}</pre>
    </div>
  );
}
