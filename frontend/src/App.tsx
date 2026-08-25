import { Activity, useState, useRef, useEffect, lazy, Suspense, useCallback } from "react";
import { Send, ChevronDown } from "lucide-react";
import { sx } from "./lib/utils";
import { formatConciergeError } from "./effect/chatErrors";
import { TimeoutError, errorMessage } from "./effect/errors";
import { invokeDeepseek } from "./lib/apiService";
import { useFavicon } from "./hooks/useFavicon";
import { getPostHogConfig } from "./lib/analytics";
import { syncThemeColor } from "./lib/themeColor";
import { chatbot } from "./styles/chatbot.stylex";
import { layout } from "./styles/common.stylex";

const MessageContent = lazy(() => import("./components/message-content"));

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const suggestedQuestions = [
  "What is Anthony's background?",
  "What are his technical skills?",
  "Where has he worked?",
  "How can I contact him?",
];

/* ── App ────────────────────────────────────────────── */

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [replyStatus, setReplyStatus] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [shadowMode, setShadowMode] = useState(true);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const leavesVideoRef = useRef<HTMLVideoElement>(null);
  const shouldAutoScroll = useRef(true);

  useFavicon();

  useEffect(() => {
    syncThemeColor(shadowMode ? "light" : "dark");
  }, [shadowMode]);

  // Shadow mode keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "s" || e.key === "S") setShadowMode((p) => !p);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Video play/pause — honor reduced motion so the looping leaves stay still.
  useEffect(() => {
    const v = leavesVideoRef.current;
    if (!v) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (!shadowMode || media.matches) {
        v.pause();
        return;
      }
      v.play().catch(() => {});
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [shadowMode]);

  // PostHog (deferred — bundle-defer-third-party)
  useEffect(() => {
    const postHogConfig = getPostHogConfig();
    if (postHogConfig) {
      import("posthog-js")
        .then(({ default: ph }) =>
          ph.init(postHogConfig.key, {
            api_host: postHogConfig.apiHost,
            person_profiles: "identified_only",
          }),
        )
        .catch(() => {});
    }
  }, []);

  /* ── Scroll ── */

  const scrollToBottom = useCallback((instant = false) => {
    const el = scrollAreaRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: instant ? "instant" : "smooth" });
    });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScroll.current = gap < 150;
    setShowScrollButton(gap > 200);
  }, []);

  // Auto-scroll when messages change
  useEffect(() => {
    if (shouldAutoScroll.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  /* ── Input ── */

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }, []);

  /* ── Submit ── */

  const handleSubmit = useCallback(
    (e?: React.FormEvent, submittedInput?: string) => {
      if (e) e.preventDefault();
      const text = (submittedInput || input).trim();
      if (!text || isStreaming) return;

      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text, timestamp: Date.now() };
      const asstMsg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "", timestamp: Date.now() };
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      setInput("");
      shouldAutoScroll.current = true;
      if (inputRef.current) inputRef.current.style.height = "auto";
      scrollToBottom();

      setMessages((prev) => [...prev, userMsg, asstMsg]);
      void (async () => {
        setIsStreaming(true);
        setReplyStatus("Assistant is writing.");
        try {
          await invokeDeepseek(text, history, (content) => {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role !== "assistant") return prev;
              return prev.map((message, index) =>
                index === prev.length - 1 ? { ...message, content } : message,
              );
            });
          });
        } catch (err) {
          console.error(err);
          setReplyStatus("The reply didn't come through. Try again.");
          const fallback = errorMessage(err) || "The reply didn't come through. Try again.";
          const partial = err instanceof TimeoutError ? err.partialContent : undefined;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role !== "assistant") return prev;
            return prev.map((message, index) =>
              index === prev.length - 1
                ? { ...message, content: formatConciergeError(partial ?? last.content, fallback) }
                : message,
            );
          });
        } finally {
          setIsStreaming(false);
          setReplyStatus((current) =>
            current === "The reply didn't come through. Try again." ? current : "Reply received.",
          );
        }
      })();
    },
    [input, isStreaming, messages, scrollToBottom],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const visibleMessages = messages;
  const hasMessages = visibleMessages.length > 0;
  const isLoading = isStreaming;
  const themeClass = shadowMode ? "chatbot-shadow" : "chatbot-dark";

  /* ── Render ── */

  return (
    <div {...sx(chatbot.root, themeClass)}>
      <a href="#chat-main" {...sx(chatbot.skipLink)}>
        Skip to conversation
      </a>
      {/* Viewport-sized wrapper + object-fit media. Putting leaves-overlay
          on the video itself keeps the intrinsic box (width/height:auto),
          so the leaves sit in a corner instead of covering every viewport. */}
      <div
        {...sx(
          'leaves-overlay',
          shadowMode ? 'leaves-overlay-visible' : 'leaves-overlay-hidden',
        )}
        aria-hidden="true"
      >
        <video
          ref={leavesVideoRef}
          src="https://leaves.anthonylim-ucsc.workers.dev/"
          loop
          muted
          playsInline
          preload="auto"
          {...sx('leaves-overlay-media')}
        />
      </div>
      <div {...sx(chatbot.overlay, chatbot.grainOverlay)} aria-hidden="true">
        <div {...sx(chatbot.grain)} />
      </div>

      {/* Main column — flex child fills root, itself a flex column */}
      <div {...sx(chatbot.column)}>
        {/* ── Header ── */}
        <header
          {...sx(
            chatbot.header,
            hasMessages ? chatbot.headerCompact : chatbot.headerExpanded,
            chatbot.headerFooter,
          )}
        >
          <div {...sx('col-fade-in')}>
            <h1
              {...sx(
                chatbot.title,
                hasMessages ? chatbot.titleCompact : null,
                'chat-text',
              )}
            >
              Anthony Lim
            </h1>
            <p
              {...sx(
                chatbot.subtitle,
                hasMessages ? chatbot.subtitleCompact : null,
                'chat-mid',
              )}
            >
              Software Engineer
            </p>
            <div
              {...sx(
                chatbot.headerRule,
                hasMessages ? chatbot.headerRuleCompact : chatbot.headerRuleExpanded,
                'chat-border',
              )}
            />
          </div>
        </header>

        {/* ── Scrollable area — THE scroll container ── */}
        <main
          id="chat-main"
          tabIndex={-1}
          ref={scrollAreaRef}
          onScroll={handleScroll}
          {...sx(chatbot.scrollArea)}
        >
          <div
            role="log"
            aria-label="Conversation"
            aria-live="polite"
            aria-relevant="additions"
            aria-busy={isStreaming}
          >
            {hasMessages ? (
              <div {...sx(chatbot.messageList)}>
                {visibleMessages.map((message, index) => {
                  const isUser = message.role === "user";
                  const isLastAssistant = !isUser && index === visibleMessages.length - 1;
                  if (!message.content && !(isLastAssistant && isLoading)) return null;

                  return (
                    <div
                      key={message.id}
                      {...sx(
                        'animate-message-in',
                        isUser ? chatbot.messageRowEnd : null,
                      )}
                    >
                      {isUser ? (
                        <div {...sx(chatbot.userBubble, 'chat-user-bubble')}>
                          {message.content}
                        </div>
                      ) : (
                        <div {...sx(chatbot.assistantBubble)}>
                          {message.content ? (
                            <Suspense fallback={<MessageSkeleton />}>
                              <MessageContent content={message.content} isStreaming={isLastAssistant && isStreaming} />
                            </Suspense>
                          ) : (
                            <TypingIndicator />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Scroll anchor */}
                <div {...sx(chatbot.scrollAnchor)} />
              </div>
            ) : (
              <div {...sx(chatbot.emptyState, 'col-fade-in', 'stagger-2')}>
                <h2 {...sx(chatbot.emptyHeading, 'chat-text')}>
                  Ask me anything about Anthony&apos;s
                  <br />
                  experience, skills, and background.
                </h2>
              </div>
            )}
          </div>
          <div {...sx(layout.srOnly)} role="status" aria-live="polite">
            {replyStatus}
          </div>
        </main>

        {/* Scroll-to-bottom FAB */}
        {showScrollButton && (
          <div {...sx(chatbot.scrollFabWrap)}>
            <button
              onClick={() => {
                shouldAutoScroll.current = true;
                scrollToBottom();
              }}
              {...sx(chatbot.scrollFab, 'animate-scale-in', 'chat-scroll-btn')}
              aria-label="Scroll to bottom"
            >
              <ChevronDown {...sx(chatbot.iconSm)} />
            </button>
          </div>
        )}

        {/* ── Footer: suggestions + input ── */}
        <div {...sx(chatbot.footer, chatbot.headerFooter)}>
          <Activity mode={hasMessages ? "hidden" : "visible"} name="chat-suggestions-grid">
            <div {...sx(chatbot.suggestionsGrid, 'col-fade-in', 'stagger-3')}>
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSubmit(undefined, q)}
                  disabled={isLoading}
                  {...sx(chatbot.suggestionBtn, 'chat-suggestion')}
                >
                  {q}
                </button>
              ))}
            </div>
          </Activity>
          <Activity mode={hasMessages ? "visible" : "hidden"} name="chat-suggestions-row">
            <div {...sx(chatbot.suggestionsRowWrap)}>
              <div {...sx(chatbot.suggestionsRow, 'no-scrollbar')}>
                {suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSubmit(undefined, q)}
                    disabled={isLoading}
                    {...sx(chatbot.suggestionChip, 'chat-suggestion')}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </Activity>

          <form onSubmit={handleSubmit} aria-busy={isStreaming}>
            <div {...sx(chatbot.inputBox, 'chat-input-box')}>
              <label htmlFor="chat-input" {...sx(layout.srOnly)}>
                Ask about Anthony
              </label>
              <textarea
                id="chat-input"
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                disabled={isLoading}
                rows={1}
                {...sx(
                  chatbot.textarea,
                  chatbot.textareaFocus,
                  isLoading && chatbot.textareaDisabled,
                  'chat-input',
                )}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                aria-label={isStreaming ? "Sending" : "Send message"}
                {...sx(chatbot.sendBtn, 'chat-send')}
              >
                <Send
                  {...sx(
                    chatbot.iconSm,
                    isStreaming && chatbot.sendIconPulse,
                  )}
                />
              </button>
            </div>
          </form>

          <div {...sx(chatbot.footerRow)}>
            <p {...sx(chatbot.footerNote, 'chat-footer')}>
              Powered by AI · Responses may be inaccurate
            </p>
            <button
              type="button"
              onClick={() => setShadowMode((p) => !p)}
              {...sx(chatbot.themeToggle, 'chat-mid')}
              title={shadowMode ? "Press S for dark mode" : "Press S for shadow mode"}
              aria-label={shadowMode ? "Switch to dark mode" : "Switch to shadow mode"}
              aria-pressed={shadowMode}
            >
              [{shadowMode ? "S:on" : "S"}]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Extracted static components (rendering-hoist-jsx) ── */

function TypingIndicator() {
  return (
    <div
      {...sx(chatbot.typingRow)}
      role="status"
      aria-live="polite"
      aria-label="Assistant is typing"
    >
      <span
        {...sx(chatbot.typingDot, 'chat-typing-dot', 'animate-typing-dot')}
      />
      <span
        {...sx(
          chatbot.typingDot,
          chatbot.typingDotDelay1,
          'chat-typing-dot',
          'animate-typing-dot',
        )}
      />
      <span
        {...sx(
          chatbot.typingDot,
          chatbot.typingDotDelay2,
          'chat-typing-dot',
          'animate-typing-dot',
        )}
      />
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div {...sx(chatbot.skeleton)}>
      <div {...sx(chatbot.skeletonLineWide, 'chat-skeleton')} />
      <div {...sx(chatbot.skeletonLineNarrow, 'chat-skeleton-light')} />
    </div>
  );
}

export default App;
