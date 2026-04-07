import { useState, useRef, useEffect, lazy, Suspense, useCallback } from "react";
import { Send, ChevronDown } from "lucide-react";
import { cn } from "./lib/utils";
import { invokeDeepseek } from "./lib/apiService";
import { useFavicon } from "./hooks/useFavicon";

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

const TYPING_DELAYS = ["", "[animation-delay:0.15s]", "[animation-delay:0.3s]"];

/* ── Hoisted static style objects (stable references — rerender-memo) ── */

const grainStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
  backgroundRepeat: "repeat",
  backgroundSize: "256px 256px",
} as const;

// CRITICAL: Inline styles for layout-structural properties.
// Tailwind v4's @config compat shim may silently drop utility classes.
// These inline styles are immune to CSS cascade / specificity issues.
const rootStyle = {
  display: "flex",
  flexDirection: "column" as const,
  height: "100dvh",
  overflow: "hidden",
};

const columnStyle = {
  display: "flex",
  flexDirection: "column" as const,
  flex: "1 1 0%",
  minHeight: 0,
  position: "relative" as const,
  zIndex: 10,
};

const scrollAreaStyle = {
  flex: "1 1 0%",
  minHeight: 0,
  overflowY: "auto" as const,
  overflowX: "hidden" as const,
  overscrollBehavior: "contain" as const,
  WebkitOverflowScrolling: "touch" as const,
};

const headerFooterStyle = { flexShrink: 0 };

const overlayStyle = {
  position: "fixed" as const,
  inset: 0,
  pointerEvents: "none" as const,
  zIndex: 1,
};

/* ── App ────────────────────────────────────────────── */

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [shadowMode, setShadowMode] = useState(true);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const leavesVideoRef = useRef<HTMLVideoElement>(null);
  const shouldAutoScroll = useRef(true);

  useFavicon();

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

  // Video play/pause
  useEffect(() => {
    const v = leavesVideoRef.current;
    if (!v) return;
    shadowMode ? v.play().catch(() => {}) : v.pause();
  }, [shadowMode]);

  // PostHog (deferred — bundle-defer-third-party)
  useEffect(() => {
    const key = import.meta.env.VITE_POSTHOG_KEY;
    if (key) {
      import("posthog-js")
        .then(({ default: ph }) =>
          ph.init(key, { api_host: "https://us.i.posthog.com", person_profiles: "identified_only" }),
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
    async (e?: React.FormEvent, submittedInput?: string) => {
      if (e) e.preventDefault();
      const text = (submittedInput || input).trim();
      if (!text || isLoading) return;

      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text, timestamp: Date.now() };
      const asstMsg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "", timestamp: Date.now() };

      setMessages((prev) => [...prev, userMsg, asstMsg]);
      setInput("");
      setIsLoading(true);
      shouldAutoScroll.current = true;
      if (inputRef.current) inputRef.current.style.height = "auto";
      scrollToBottom();

      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        await invokeDeepseek(text, history, (content) => {
          if (!isStreaming) setIsStreaming(true);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") last.content = content;
            return next;
          });
        });
      } catch (err) {
        console.error(err);
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") last.content = "I apologize, but something went wrong. Please try again.";
          return next;
        });
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
      }
    },
    [input, isLoading, isStreaming, messages, scrollToBottom],
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

  const hasMessages = messages.length > 0;
  const themeClass = shadowMode ? "chatbot-shadow" : "chatbot-dark";

  /* ── Render ── */

  return (
    <div className={cn("font-mono transition-colors duration-700", themeClass)} style={rootStyle}>
      {/* Decorative overlays — z-index 1, BELOW content z-index 10 */}
      <video
        ref={leavesVideoRef}
        src="https://leaves.anthonylim-ucsc.workers.dev/"
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        className="leaves-overlay"
        style={{ opacity: shadowMode ? 1 : 0 }}
      />
      <div className="opacity-[0.04]" style={{ ...overlayStyle, zIndex: 2 }} aria-hidden="true">
        <div className="w-full h-full" style={grainStyle} />
      </div>

      {/* Main column — flex child fills root, itself a flex column */}
      <div className="max-w-2xl mx-auto w-full safe-top" style={columnStyle}>
        {/* ── Header ── */}
        <header
          className={cn(
            "text-left transition-all duration-700 ease-out px-6",
            hasMessages ? "py-4" : "py-8 sm:py-14",
          )}
          style={headerFooterStyle}
        >
          <div className="transition-all duration-700 col-fade-in">
            <h1
              className={cn(
                "font-mono font-medium tracking-[0.07em] uppercase chat-text transition-all duration-700",
                hasMessages ? "text-[10px]" : "text-[10px] sm:text-[11px]",
              )}
            >
              Anthony Lim
            </h1>
            <p
              className={cn(
                "font-mono chat-mid transition-all duration-700 mt-1",
                hasMessages ? "text-[10px]" : "text-[10px] sm:text-[11px]",
              )}
            >
              Software Engineer
            </p>
            <div className={cn("transition-all duration-700 border-t chat-border", hasMessages ? "mt-3" : "mt-5")} />
          </div>
        </header>

        {/* ── Scrollable area — THE scroll container ── */}
        <div ref={scrollAreaRef} onScroll={handleScroll} className="px-6" style={scrollAreaStyle}>
          {hasMessages ? (
            <>
              <div className="space-y-5 py-2">
                {messages.map((message, index) => {
                  const isUser = message.role === "user";
                  const isLastAssistant = !isUser && index === messages.length - 1;
                  if (!message.content && !(isLastAssistant && isLoading)) return null;

                  return (
                    <div key={message.id} className={cn("animate-message-in", isUser && "flex justify-end")}>
                      {isUser ? (
                        <div className="chat-user-bubble max-w-[85%] sm:max-w-[75%] text-[14px] leading-[1.7] font-mono px-4 py-2.5 rounded-lg transition-colors duration-700">
                          {message.content}
                        </div>
                      ) : (
                        <div className="max-w-[92%] sm:max-w-[85%]">
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
              </div>
              {/* Scroll anchor */}
              <div className="h-4" />
            </>
          ) : (
            <div
              className="col-fade-in stagger-2 py-4 sm:py-10"
              style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}
            >
              <h2 className="font-mono font-normal leading-[1.5] chat-text transition-colors duration-700 text-base sm:text-lg">
                Ask me anything about Anthony&apos;s
                <br />
                experience, skills, and background.
              </h2>
            </div>
          )}
        </div>

        {/* Scroll-to-bottom FAB */}
        {showScrollButton && (
          <div style={{ position: "relative", zIndex: 20 }} className="px-6">
            <button
              onClick={() => {
                shouldAutoScroll.current = true;
                scrollToBottom();
              }}
              className="absolute bottom-2 right-6 p-2 transition-all duration-300 animate-scale-in chat-scroll-btn"
              aria-label="Scroll to bottom"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Footer: suggestions + input ── */}
        <div className="pb-safe px-6 py-4" style={headerFooterStyle}>
          {!hasMessages ? (
            <div className="grid grid-cols-2 gap-2 col-fade-in stagger-3 mb-5">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSubmit(undefined, q)}
                  disabled={isLoading}
                  className="chat-suggestion text-left text-[12px] font-mono leading-[1.6] px-3 py-2.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {q}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-3" style={{ marginLeft: "-1.5rem", marginRight: "-1.5rem" }}>
              <div
                className="no-scrollbar"
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  overflowX: "auto",
                  paddingLeft: "1.5rem",
                  paddingRight: "1.5rem",
                  paddingBottom: "0.25rem",
                  scrollSnapType: "x proximity",
                }}
              >
                {suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSubmit(undefined, q)}
                    disabled={isLoading}
                    className="chat-suggestion text-[11px] font-mono transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ flexShrink: 0, scrollSnapAlign: "start", padding: "0.375rem 0.75rem" }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="chat-input-box flex items-end gap-3 px-3 py-2 transition-all duration-700">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                disabled={isLoading}
                rows={1}
                className="chat-input flex-1 bg-transparent border-none outline-none resize-none text-[14px] font-mono leading-[1.7] px-1 py-1.5 max-h-[120px] disabled:opacity-50 transition-colors duration-700"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="chat-send shrink-0 p-2 transition-all duration-300 disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="flex items-center justify-between mt-3">
            <p className="chat-footer text-[10px] font-mono tracking-[0.04em] transition-colors duration-700">
              Powered by AI · Responses may be inaccurate
            </p>
            <button
              onClick={() => setShadowMode((p) => !p)}
              className="chat-mid text-[10px] font-mono tracking-[0.04em] uppercase transition-colors duration-300 opacity-50 hover:opacity-100"
              title={shadowMode ? "Press S for dark mode" : "Press S for shadow mode"}
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
    <div className="flex items-center gap-1.5 py-1 px-1">
      {TYPING_DELAYS.map((delay, i) => (
        <span
          key={i}
          className={cn("w-1.5 h-1.5 rounded-full chat-typing-dot animate-typing-dot transition-colors duration-700", delay)}
        />
      ))}
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-2.5 rounded w-3/4 chat-skeleton" />
      <div className="h-2.5 rounded w-1/2 chat-skeleton-light" />
    </div>
  );
}

export default App;
