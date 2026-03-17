import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
}

// Hoisted regex - avoids recreation on every render
const THINK_REGEX = /^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/;

const MessageContent = ({ content, isStreaming = false }: MessageContentProps) => {
  // Handle think tags (AI reasoning)
  const thinkMatch = content.match(THINK_REGEX);
  const hasThinkTag = thinkMatch !== null;
  const thinkContent = hasThinkTag ? thinkMatch[1] : "";
  const mainContent = hasThinkTag ? thinkMatch[2] : content;

  return (
    <div className="message-content">
      {/* Think content (AI reasoning) */}
      {hasThinkTag && thinkContent.trim() && (
        <div className="text-xs text-white/40 mb-3 pb-3 border-b border-white/10 italic">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {thinkContent.trim()}
          </ReactMarkdown>
        </div>
      )}

      {/* Main content */}
      <div className="prose prose-sm prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            // Paragraphs
            p: ({ children }) => (
              <p className="mb-3 last:mb-0 leading-relaxed text-[15px]">
                {children}
              </p>
            ),

            // Links
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#A5B4FC] hover:text-[#C7D2FE] underline decoration-[#6366F1]/30 underline-offset-2 transition-colors"
              >
                {children}
              </a>
            ),

            // Strong/Bold
            strong: ({ children }) => (
              <strong className="font-semibold text-white">{children}</strong>
            ),

            // Emphasis/Italic
            em: ({ children }) => (
              <em className="italic text-white/90">{children}</em>
            ),

            // Code blocks and inline code
            code: ({ className, children, ...props }) => {
              const isInline = !className;

              if (isInline) {
                return (
                  <code
                    className="px-1.5 py-0.5 rounded bg-white/10 text-[#A5B4FC] text-[13px] font-mono"
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
              <pre className="my-3 p-4 bg-black/30 rounded-xl overflow-x-auto border border-white/5 text-[13px]">
                {children}
              </pre>
            ),

            // Unordered lists
            ul: ({ children }) => (
              <ul className="my-3 space-y-1.5 list-disc list-inside marker:text-white/50">
                {children}
              </ul>
            ),

            // Ordered lists
            ol: ({ children }) => (
              <ol className="my-3 space-y-1.5 list-decimal list-inside marker:text-white/50">
                {children}
              </ol>
            ),

            // List items
            li: ({ children }) => (
              <li className="leading-relaxed text-[15px]">{children}</li>
            ),

            // Blockquotes
            blockquote: ({ children }) => (
              <blockquote className="my-3 pl-4 border-l-2 border-[#6366F1]/40 text-white/80 italic">
                {children}
              </blockquote>
            ),

            // Headings
            h1: ({ children }) => (
              <h1 className="text-xl font-bold mb-4 mt-6 first:mt-0 text-white">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-lg font-semibold mb-3 mt-5 first:mt-0 text-white">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-base font-semibold mb-2 mt-4 first:mt-0 text-white">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-sm font-semibold mb-2 mt-3 first:mt-0 text-white">
                {children}
              </h4>
            ),

            // Tables
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
                <table className="min-w-full text-sm">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-white/5 border-b border-white/10">
                {children}
              </thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-white/5">{children}</tbody>
            ),
            th: ({ children }) => (
              <th className="px-3 py-2 text-left font-medium text-white">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 text-white/80">{children}</td>
            ),

            // Horizontal rule
            hr: () => <hr className="my-6 border-white/10" />,

            // Images
            img: ({ src, alt }) => (
              <img
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                className="my-3 rounded-lg max-w-full border border-white/10"
              />
            ),
          }}
        >
          {mainContent}
        </ReactMarkdown>
      </div>

      {/* Streaming cursor */}
      {isStreaming && (
        <span className="inline-block w-0.5 h-4 ml-1 bg-white/70 animate-cursor-blink align-middle" />
      )}
    </div>
  );
};

export default MessageContent;
