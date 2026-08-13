import type { Components } from "react-markdown";
import type { PluggableList } from "unified";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { CodeBlock } from "./CodeBlock";

export const remarkPlugins: PluggableList = [remarkGfm];
export const rehypePlugins: PluggableList = [
  [rehypeHighlight, { ignoreMissing: true }],
];

export const markdownComponents: Components = {
  p: ({ children }) => <p>{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  del: ({ children }) => <del>{children}</del>,
  code: ({ className, children, ...props }) => {
    const isBlock = typeof className === "string" && className.includes("language-");
    if (!isBlock) {
      return (
        <code className="message-inline-code" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  ul: ({ className, children }) => <ul className={className}>{children}</ul>,
  ol: ({ children }) => <ol>{children}</ol>,
  li: ({ className, children, ...props }) => (
    <li className={className} {...props}>
      {children}
    </li>
  ),
  input: (props) =>
    props.type === "checkbox" ? (
      <input
        type="checkbox"
        checked={!!props.checked}
        disabled
        readOnly
        className="message-task-check"
        aria-label={props.checked ? "Completed" : "Not completed"}
      />
    ) : (
      <input {...props} />
    ),
  table: ({ children }) => (
    <div className="message-table-wrap">
      <table>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children, style }) => <th style={style}>{children}</th>,
  td: ({ children, style }) => <td style={style}>{children}</td>,
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
  h1: ({ children }) => <h1>{children}</h1>,
  h2: ({ children }) => <h2>{children}</h2>,
  h3: ({ children }) => <h3>{children}</h3>,
  h4: ({ children }) => <h4>{children}</h4>,
  hr: () => <hr />,
  img: ({ src, alt }) => (
    <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" className="message-img" />
  ),
};
