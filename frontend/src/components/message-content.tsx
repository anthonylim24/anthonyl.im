import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

interface MessageData {
  id?: string;
  type: string;
  data: string;
}

interface MessageContentProps {
  content: string | MessageData;
}

const preprocessContent = (content: string): string => {
  // First, handle the introduction text with colon
  let processed = content.replace(/^(.*?:)\s*(\d+\.)/, "$1\n$2");

  // Then handle the numbered list items
  processed = processed.replace(/(\d+\..*?)(?=\d+\.|$)/g, "$1\n");

  return processed;
};

const MessageContent = ({ content }: MessageContentProps) => {
  // Handle structured message data
  if (typeof content !== "string" && "type" in content) {
    if (content.type === "message") {
      const processedContent = preprocessContent(content.data);
      return (
        <div className="text-gray-200 whitespace-pre-wrap">
          {processedContent}
        </div>
      );
    }
    return null;
  }

  // Handle markdown content with think tags
  const thinkMatch = content.match(/^<think>(.*?)<\/think>\s*(.*)$/s);
  const hasThinkTag = thinkMatch !== null;

  const thinkContent = hasThinkTag ? thinkMatch[1] : "";
  const regularContent = hasThinkTag ? thinkMatch[2] : content;

  return (
    <div className="prose prose-sm dark:prose-invert break-words max-w-none">
      {hasThinkTag && (
        <div className="text-xs text-gray-500 mb-2 italic">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {thinkContent}
          </ReactMarkdown>
        </div>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline decoration-2 underline-offset-2 transition-colors duration-200"
            >
              {children}
            </a>
          ),
          code: ({
            inline,
            className,
            children,
            ...props
          }: React.DetailedHTMLProps<
            React.HTMLAttributes<HTMLElement>,
            HTMLElement
          > & { inline?: boolean }) => {
            return !inline ? (
              <pre className="my-4 p-4 bg-gray-900/80 rounded-lg overflow-x-auto border border-gray-700/50 shadow-lg">
                <code
                  className={`${className || ""} text-sm leading-relaxed`}
                  {...props}
                >
                  {children}
                </code>
              </pre>
            ) : (
              <code
                className="bg-gray-800/80 px-1.5 py-0.5 rounded text-sm font-mono text-blue-300"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="!mt-2 !mb-4">{children}</pre>,
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-4 space-y-2 text-gray-200">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-4 space-y-2 text-gray-200">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-2">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-blue-500/50 dark:border-blue-400/30 pl-4 my-4 italic text-gray-300 bg-gray-800/30 py-2 rounded-r-lg">
              {children}
            </blockquote>
          ),
          h1: ({ children }) => (
            <h1 className="text-3xl font-bold mb-6 text-gray-100 tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-2xl font-semibold mb-4 text-gray-100 tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xl font-medium mb-3 text-gray-100 tracking-tight">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-lg font-medium mb-2 text-gray-100 tracking-tight">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-base font-medium mb-2 text-gray-100 tracking-tight">
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-sm font-medium mb-2 text-gray-100 tracking-tight">
              {children}
            </h6>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-lg border border-gray-700/50">
              <table className="min-w-full divide-y divide-gray-700/50 bg-gray-900/30">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-800/50">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-gray-700/50">{children}</tbody>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
              {children}
            </td>
          ),
          hr: () => <hr className="my-8 border-gray-700/50" />,
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt}
              className="rounded-lg shadow-lg max-w-full my-4 border border-gray-700/30"
            />
          ),
          span: ({ className, children }) =>
            className === "think" ? (
              <span className="text-xs text-gray-500">{children}</span>
            ) : (
              <span className={className}>{children}</span>
            ),
          sub: ({ children }) => (
            <sub className="relative bottom-[-0.25em] text-[0.75em]">
              {children}
            </sub>
          ),
          sup: ({ children }) => (
            <sup className="relative top-[-0.5em] text-[0.75em]">
              {children}
            </sup>
          ),
        }}
      >
        {preprocessContent(regularContent)}
      </ReactMarkdown>
    </div>
  );
};

export default MessageContent;
