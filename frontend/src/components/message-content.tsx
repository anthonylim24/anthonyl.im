import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
  shadowMode?: boolean;
}

// Hoisted regex - avoids recreation on every render
const THINK_REGEX = /^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/;

const MessageContent = ({ content, isStreaming = false, shadowMode = false }: MessageContentProps) => {
  // Handle think tags (AI reasoning)
  const thinkMatch = content.match(THINK_REGEX);
  const hasThinkTag = thinkMatch !== null;
  const thinkContent = hasThinkTag ? thinkMatch[1] : "";
  const mainContent = hasThinkTag ? thinkMatch[2] : content;

  // Color tokens based on mode
  const text = shadowMode ? "#1a1a1a" : "#b4b4b4";
  const textBright = shadowMode ? "#000" : "#e0e0e0";
  const textMuted = shadowMode ? "#888" : "#606060";
  const border = shadowMode ? "#d8d5cf" : "#181818";
  const codeBg = shadowMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)";
  const codeText = shadowMode ? "#444" : "#999";

  return (
    <div className="message-content">
      {/* Think content (AI reasoning) */}
      {hasThinkTag && thinkContent.trim() && (
        <div
          className="text-[12px] font-mono mb-3 pb-3 italic leading-[1.7] transition-colors duration-700"
          style={{ color: textMuted, borderBottom: `1px solid ${border}` }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {thinkContent.trim()}
          </ReactMarkdown>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            // Paragraphs
            p: ({ children }) => (
              <p
                className="mb-3 last:mb-0 text-[14px] font-mono leading-[1.7] transition-colors duration-700"
                style={{ color: text }}
              >
                {children}
              </p>
            ),

            // Links
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 transition-colors duration-300"
                style={{
                  color: textBright,
                  textDecorationColor: border,
                }}
              >
                {children}
              </a>
            ),

            // Strong/Bold
            strong: ({ children }) => (
              <strong
                className="font-medium transition-colors duration-700"
                style={{ color: textBright }}
              >
                {children}
              </strong>
            ),

            // Emphasis/Italic
            em: ({ children }) => (
              <em className="italic" style={{ color: text }}>
                {children}
              </em>
            ),

            // Code blocks and inline code
            code: ({ className, children, ...props }) => {
              const isInline = !className;

              if (isInline) {
                return (
                  <code
                    className="px-1 py-0.5 text-[13px] font-mono transition-colors duration-700"
                    style={{ background: codeBg, color: codeText }}
                    {...props}
                  >
                    {children}
                  </code>
                );
              }

              return (
                <code className={`${className || ""} text-[13px]`} {...props}>
                  {children}
                </code>
              );
            },

            // Pre (code block wrapper)
            pre: ({ children }) => (
              <pre
                className="my-3 p-4 overflow-x-auto text-[13px] font-mono transition-colors duration-700"
                style={{
                  background: codeBg,
                  border: `1px solid ${border}`,
                }}
              >
                {children}
              </pre>
            ),

            // Unordered lists
            ul: ({ children }) => (
              <ul
                className="my-3 space-y-1 list-none"
                style={{ color: text }}
              >
                {children}
              </ul>
            ),

            // Ordered lists
            ol: ({ children }) => (
              <ol
                className="my-3 space-y-1 list-decimal list-inside"
                style={{ color: textMuted }}
              >
                {children}
              </ol>
            ),

            // List items
            li: ({ children }) => (
              <li className="text-[14px] font-mono leading-[1.7] transition-colors duration-700 pl-3" style={{ color: text }}>
                <span style={{ color: textMuted, marginRight: "8px" }}>—</span>
                {children}
              </li>
            ),

            // Blockquotes
            blockquote: ({ children }) => (
              <blockquote
                className="my-3 pl-4 italic text-[14px] font-mono leading-[1.7] transition-colors duration-700"
                style={{
                  borderLeft: `2px solid ${border}`,
                  color: textMuted,
                }}
              >
                {children}
              </blockquote>
            ),

            // Headings
            h1: ({ children }) => (
              <h1
                className="text-[16px] font-mono font-medium mb-4 mt-6 first:mt-0 uppercase tracking-[0.05em] transition-colors duration-700"
                style={{ color: textBright }}
              >
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2
                className="text-[14px] font-mono font-medium mb-3 mt-5 first:mt-0 uppercase tracking-[0.05em] transition-colors duration-700"
                style={{ color: textBright }}
              >
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3
                className="text-[14px] font-mono font-medium mb-2 mt-4 first:mt-0 transition-colors duration-700"
                style={{ color: textBright }}
              >
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4
                className="text-[13px] font-mono font-medium mb-2 mt-3 first:mt-0 transition-colors duration-700"
                style={{ color: textBright }}
              >
                {children}
              </h4>
            ),

            // Tables
            table: ({ children }) => (
              <div
                className="my-3 overflow-x-auto transition-colors duration-700"
                style={{ border: `1px solid ${border}` }}
              >
                <table className="min-w-full text-[13px] font-mono">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead
                className="transition-colors duration-700"
                style={{
                  background: codeBg,
                  borderBottom: `1px solid ${border}`,
                }}
              >
                {children}
              </thead>
            ),
            tbody: ({ children }) => (
              <tbody>{children}</tbody>
            ),
            th: ({ children }) => (
              <th
                className="px-3 py-2 text-left font-medium text-[12px] uppercase tracking-[0.05em] transition-colors duration-700"
                style={{ color: textBright }}
              >
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td
                className="px-3 py-2 transition-colors duration-700"
                style={{ color: text, borderTop: `1px solid ${border}` }}
              >
                {children}
              </td>
            ),

            // Horizontal rule
            hr: () => (
              <hr
                className="my-6 border-0 h-px transition-colors duration-700"
                style={{ background: border }}
              />
            ),

            // Images
            img: ({ src, alt }) => (
              <img
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                className="my-3 max-w-full transition-colors duration-700"
                style={{ border: `1px solid ${border}` }}
              />
            ),
          }}
        >
          {mainContent}
        </ReactMarkdown>
      </div>

      {/* Streaming cursor */}
      {isStreaming && (
        <span
          className="inline-block w-[1px] h-[14px] ml-0.5 animate-cursor-blink align-middle transition-colors duration-700"
          style={{ background: textMuted }}
        />
      )}
    </div>
  );
};

export default MessageContent;
