import ReactMarkdown from "react-markdown";
import { stripThink } from "./stripThink";
import { remarkPlugins, rehypePlugins, markdownComponents } from "./markdownComponents";

export interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
}

const MessageContent = ({ content, isStreaming = false }: MessageContentProps) => {
  const { think, main, thinking } = stripThink(content, isStreaming);
  const showThink = Boolean(think?.trim()) || thinking;

  return (
    <div className="message-content">
      {showThink ? (
        <div
          className="message-think"
          aria-label={thinking ? "Thinking" : "Thought process"}
        >
          {think?.trim() ? (
            <ReactMarkdown remarkPlugins={remarkPlugins}>{think.trim()}</ReactMarkdown>
          ) : (
            <span className="message-think-pending">…</span>
          )}
        </div>
      ) : null}

      {main ? (
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={markdownComponents}
        >
          {main}
        </ReactMarkdown>
      ) : null}

      {isStreaming ? (
        <span className="message-cursor" aria-hidden="true" />
      ) : null}
    </div>
  );
};

export default MessageContent;
