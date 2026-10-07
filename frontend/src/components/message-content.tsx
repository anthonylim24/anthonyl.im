import { isValidElement, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { sx } from "@/lib/utils";
import { messageContent } from "@/styles/messageContent.stylex";
import { chatbot } from "@/styles/chatbot.stylex";

interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
}

// Hoisted plugin arrays — prevents ReactMarkdown from treating them as new props
const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

const THINK_REGEX = /^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/;
const CODE_DOTS = ["#FF7E6B", "#FFD978", "#9EE6C8"];

/** Fenced code: candy-coloured card with a language tab and a copy button. */
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const className = isValidElement<{ className?: string }>(children) ? (children.props.className ?? "") : "";
  const lang = /language-([\w+-]+)/.exec(className)?.[1] ?? "code";
  const copy = () => {
    const text = preRef.current?.textContent ?? "";
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div {...sx(messageContent.codeWrap, "lim-code")}>
      <div {...sx(messageContent.codeBar)}>
        {CODE_DOTS.map((c) => (
          <span key={c} {...sx(messageContent.codeDot)} style={{ backgroundColor: c }} aria-hidden="true" />
        ))}
        <span {...sx(messageContent.codeLang)}>{lang}</span>
        <button type="button" onClick={copy} {...sx(messageContent.codeCopy)} aria-label={copied ? "Code copied" : "Copy code"}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre ref={preRef} {...sx(messageContent.pre)}>
        {children}
      </pre>
    </div>
  );
}

// Hoisted ReactMarkdown components — stable reference, uses CSS vars for theming
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p {...sx(messageContent.paragraph)}>{children}</p>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...sx(messageContent.link)}>
      {children}
    </a>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => <strong {...sx(messageContent.strong)}>{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em {...sx(messageContent.em)}>{children}</em>,
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
    if (!className) {
      return (
        <code {...sx(messageContent.inlineCode)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code {...sx(messageContent.blockCode, className)} {...props}>
        {children}
      </code>
    );
  },
  pre: CodeBlock,
  ul: ({ children }: { children?: React.ReactNode }) => <ul {...sx(messageContent.ul)}>{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol {...sx(messageContent.ol)}>{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li {...sx(messageContent.li)}>{children}</li>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote {...sx(messageContent.blockquote)}>{children}</blockquote>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => <h1 {...sx(messageContent.h1)}>{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 {...sx(messageContent.h2)}>{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 {...sx(messageContent.h3)}>{children}</h3>,
  h4: ({ children }: { children?: React.ReactNode }) => <h4 {...sx(messageContent.h4)}>{children}</h4>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div {...sx(messageContent.tableWrap)}>
      <table {...sx(messageContent.table)}>{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => <thead {...sx(messageContent.thead)}>{children}</thead>,
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
  th: ({ children }: { children?: React.ReactNode }) => <th {...sx(messageContent.th)}>{children}</th>,
  td: ({ children }: { children?: React.ReactNode }) => <td {...sx(messageContent.td)}>{children}</td>,
  hr: () => <hr {...sx(messageContent.hr)} />,
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <img src={src} alt={alt} loading="lazy" decoding="async" {...sx(messageContent.img)} />
  ),
};

const MessageContent = ({ content, isStreaming = false }: MessageContentProps) => {
  const thinkMatch = content.match(THINK_REGEX);
  const thinkContent = thinkMatch ? thinkMatch[1] : "";
  const mainContent = thinkMatch ? thinkMatch[2] : content;

  return (
    <div {...sx("message-content")}>
      {thinkContent.trim() && (
        <div {...sx(messageContent.thinkBlock)}>
          <ReactMarkdown remarkPlugins={remarkPlugins}>{thinkContent.trim()}</ReactMarkdown>
        </div>
      )}
      <div {...sx(messageContent.body)}>
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={markdownComponents}>
          {mainContent}
        </ReactMarkdown>
        {isStreaming && <span {...sx(chatbot.caret)} aria-hidden="true" />}
      </div>
    </div>
  );
};

export default MessageContent;
