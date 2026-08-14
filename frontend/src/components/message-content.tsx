import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
}

// Hoisted plugin arrays — prevents ReactMarkdown from treating them as new props
const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

const THINK_REGEX = /^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/;

// Stable style objects using CSS custom properties — never recreated
const s = {
  text: { color: "var(--chat-text)" } as const,
  bright: { color: "var(--chat-bright)" } as const,
  mid: { color: "var(--chat-mid)" } as const,
  code: { background: "var(--chat-code-bg)", color: "var(--chat-code-text)" } as const,
  codeBorder: { background: "var(--chat-code-bg)", border: "1px solid var(--chat-line)" } as const,
  border: { borderLeft: "2px solid var(--chat-line)", color: "var(--chat-mid)" } as const,
  thinBorder: { border: "1px solid var(--chat-line)" } as const,
  cellBorder: { color: "var(--chat-text)", borderTop: "1px solid var(--chat-line)" } as const,
  theadBg: { background: "var(--chat-code-bg)", borderBottom: "1px solid var(--chat-line)" } as const,
  hr: { background: "var(--chat-line)" } as const,
  cursor: { background: "var(--chat-mid)" } as const,
  thinkBorder: { color: "var(--chat-mid)", borderBottom: "1px solid var(--chat-line)" } as const,
  linkDecor: { color: "var(--chat-bright)", textDecorationColor: "var(--chat-line)" } as const,
  imgBorder: { border: "1px solid var(--chat-line)" } as const,
  dashPrefix: { color: "var(--chat-mid)", marginRight: "8px" } as const,
};

// Hoisted ReactMarkdown components — stable reference, uses CSS vars for theming
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-3 last:mb-0 text-[15px] leading-[1.65]" style={s.text}>{children}</p>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={s.linkDecor}>{children}</a>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-medium" style={s.bright}>{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic" style={s.text}>{children}</em>
  ),
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
    if (!className) {
      return <code className="px-1 py-0.5 text-[13px] font-mono rounded-[4px]" style={s.code} {...props}>{children}</code>;
    }
    return <code className={`${className} text-[13px]`} {...props}>{children}</code>;
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-3 p-4 overflow-x-auto text-[13px] font-mono rounded-[var(--ch-r-control,8px)]" style={s.codeBorder}>{children}</pre>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-3 space-y-1 list-none" style={s.text}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-3 space-y-1 list-decimal list-inside" style={s.mid}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-[15px] leading-[1.65] pl-3" style={s.text}>
      <span style={s.dashPrefix}>—</span>{children}
    </li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-3 pl-4 italic text-[15px] leading-[1.65]" style={s.border}>{children}</blockquote>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-[18px] font-semibold mb-3 mt-6 first:mt-0 tracking-[-0.01em]" style={s.bright}>{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-[16px] font-semibold mb-2 mt-5 first:mt-0 tracking-[-0.01em]" style={s.bright}>{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-[15px] font-semibold mb-2 mt-4 first:mt-0" style={s.bright}>{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-[15px] font-medium mb-2 mt-3 first:mt-0" style={s.bright}>{children}</h4>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 overflow-x-auto" style={s.thinBorder}>
      <table className="min-w-full text-[13px] font-mono">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead style={s.theadBg}>{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-2 text-left font-medium text-[13px]" style={s.bright}>{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-2" style={s.cellBorder}>{children}</td>
  ),
  hr: () => <hr className="my-6 border-0 h-px" style={s.hr} />,
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <img src={src} alt={alt} loading="lazy" decoding="async" className="my-3 max-w-full" style={s.imgBorder} />
  ),
};

const MessageContent = ({ content, isStreaming = false }: MessageContentProps) => {
  const thinkMatch = content.match(THINK_REGEX);
  const hasThinkTag = thinkMatch !== null;
  const thinkContent = hasThinkTag ? thinkMatch[1] : "";
  const mainContent = hasThinkTag ? thinkMatch[2] : content;

  return (
    <div className="message-content">
      {hasThinkTag && thinkContent.trim() && (
        <div className="text-[13px] mb-3 pb-3 italic leading-[1.6]" style={s.thinkBorder}>
          <ReactMarkdown remarkPlugins={remarkPlugins}>{thinkContent.trim()}</ReactMarkdown>
        </div>
      )}

      <div className="max-w-none">
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={markdownComponents}>
          {mainContent}
        </ReactMarkdown>
      </div>

      {isStreaming && (
        <span className="inline-block w-[1px] h-[14px] ml-0.5 animate-cursor-blink align-middle" style={s.cursor} />
      )}
    </div>
  );
};

export default MessageContent;
