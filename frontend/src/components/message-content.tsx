import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { sx } from "@/lib/utils";
import { messageContent } from "@/styles/messageContent.stylex";

interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
}

// Hoisted plugin arrays — prevents ReactMarkdown from treating them as new props
const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

const THINK_REGEX = /^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/;

// Hoisted ReactMarkdown components — stable reference, uses CSS vars for theming
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p {...sx(messageContent.paragraph)}>{children}</p>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...sx(messageContent.link)}>
      {children}
    </a>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong {...sx(messageContent.strong)}>{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em {...sx(messageContent.em)}>{children}</em>
  ),
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
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre {...sx(messageContent.pre)}>{children}</pre>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul {...sx(messageContent.ul)}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol {...sx(messageContent.ol)}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li {...sx(messageContent.li)}>
      <span {...sx(messageContent.dashPrefix)}>—</span>
      {children}
    </li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote {...sx(messageContent.blockquote)}>{children}</blockquote>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 {...sx(messageContent.h1)}>{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 {...sx(messageContent.h2)}>{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 {...sx(messageContent.h3)}>{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 {...sx(messageContent.h4)}>{children}</h4>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div {...sx(messageContent.tableWrap)}>
      <table {...sx(messageContent.table)}>{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead {...sx(messageContent.thead)}>{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
  th: ({ children }: { children?: React.ReactNode }) => (
    <th {...sx(messageContent.th)}>{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td {...sx(messageContent.td)}>{children}</td>
  ),
  hr: () => <hr {...sx(messageContent.hr)} />,
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      {...sx(messageContent.img)}
    />
  ),
};

const MessageContent = ({ content, isStreaming = false }: MessageContentProps) => {
  const thinkMatch = content.match(THINK_REGEX);
  const hasThinkTag = thinkMatch !== null;
  const thinkContent = hasThinkTag ? thinkMatch[1] : "";
  const mainContent = hasThinkTag ? thinkMatch[2] : content;

  return (
    <div {...sx('message-content')}>
      {hasThinkTag && thinkContent.trim() && (
        <div {...sx(messageContent.thinkBlock)}>
          <ReactMarkdown remarkPlugins={remarkPlugins}>{thinkContent.trim()}</ReactMarkdown>
        </div>
      )}

      <div {...sx(messageContent.body)}>
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={markdownComponents}>
          {mainContent}
        </ReactMarkdown>
      </div>

      {isStreaming && (
        <span {...sx(messageContent.cursor, 'animate-cursor-blink')} />
      )}
    </div>
  );
};

export default MessageContent;
