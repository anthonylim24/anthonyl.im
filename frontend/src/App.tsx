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

// Hoisted static styles to avoid re-creation on every render
const grainStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
  backgroundRepeat: "repeat",
  backgroundSize: "256px 256px",
} as const;

const TYPING_DELAYS = ["", "[animation-delay:0.15s]", "[animation-delay:0.3s]"];

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [shadowMode, setShadowMode] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const leavesVideoRef = useRef<HTMLVideoElement>(null);
  const shouldAutoScroll = useRef(true);

  useFavicon();

  // Don't trigger keyboard shortcuts when typing in form fields
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "s" || e.key === "S") {
        setShadowMode((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const video = leavesVideoRef.current;
    if (!video) return;

    if (shadowMode) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [shadowMode]);

  useEffect(() => {
    let rafId: number;
    const updateViewportHeight = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const nextHeight = window.visualViewport?.height ?? window.innerHeight;
        setViewportHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      });
    };

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("resize", updateViewportHeight);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('posthog-js').then(({ default: posthog }) => {
        posthog.init("phc_yZpQ6Ze2cZ6rAtVHUsHl8o0l4cW0X23xncC2lA6K836", {
          api_host: "https://us.i.posthog.com",
          person_profiles: "identified_only",
        });
      }).catch(() => {});
    }
  }, []);

  const scrollToBottom = (instant = false) => {
    if (messagesEndRef.current) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: instant ? "instant" : "smooth",
          block: "end",
        });
      });
    }
  };

  const handleScroll = useCallback(() => {
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    shouldAutoScroll.current = distanceFromBottom < 150;
    setShowScrollButton(distanceFromBottom > 200);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (shouldAutoScroll.current) {
      scrollToBottom();
    }
  }, [messages]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, []);

  const handleSubmit = async (e?: React.FormEvent, submittedInput?: string) => {
    if (e) e.preventDefault();

    const messageToSend = submittedInput || input;
    if (!messageToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageToSend.trim(),
      timestamp: Date.now(),
    };

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setIsLoading(true);
    shouldAutoScroll.current = true;

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    scrollToBottom();

    try {
      const messageHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      await invokeDeepseek(messageToSend, messageHistory, (content) => {
        if (!isStreaming) setIsStreaming(true);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            last.content = content;
          }
          return updated;
        });
      });
    } catch (error) {
      console.error(error);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          last.content = "I apologize, but something went wrong. Please try again.";
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasMessages = messages.length > 0;
  const isShortViewport = viewportHeight > 0 && viewportHeight < 760;
  const themeClass = shadowMode ? "chatbot-shadow" : "chatbot-dark";

  return (
    <div className={cn("min-h-dvh flex flex-col font-mono transition-colors duration-700", themeClass)}>
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

      <div className="fixed inset-0 pointer-events-none z-[2] opacity-[0.04]" style={grainStyle} aria-hidden="true" />

      <div className="relative z-10 flex flex-col flex-1 max-w-2xl mx-auto w-full safe-top isolate">
        <header className={cn(
          "shrink-0 text-left transition-all duration-700 ease-out px-6",
          hasMessages ? "py-4" : isShortViewport ? "py-4 sm:py-6" : "py-8 sm:py-14"
        )}>
          <div className="transition-all duration-700 col-fade-in">
            <h1 className={cn(
              "font-mono font-medium tracking-[0.07em] uppercase chat-text transition-all duration-700",
              hasMessages ? "text-[10px]" : "text-[10px] sm:text-[11px]"
            )}>
              Anthony Lim
            </h1>
            <p className={cn(
              "font-mono chat-mid transition-all duration-700 mt-1",
              hasMessages ? "text-[10px]" : "text-[10px] sm:text-[11px]"
            )}>
              Software Engineer
            </p>
            <div className={cn(
              "transition-all duration-700 border-t chat-border",
              hasMessages ? "mt-3" : "mt-5"
            )} />
          </div>
        </header>

        <div className="flex-1 flex flex-col">
          {hasMessages ? (
            <div className="px-6 pb-4">
              <div className="space-y-5 py-2">
                {messages.map((message, index) => {
                  const isUser = message.role === "user";
                  const isLastAssistant = !isUser && index === messages.length - 1;
                  const showContent = message.content || (isLastAssistant && isLoading);

                  if (!showContent) return null;

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
                              <MessageContent
                                content={message.content}
                                isStreaming={isLastAssistant && isStreaming}
                              />
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
              <div ref={messagesEndRef} className="h-4 shrink-0" />
            </div>
          ) : (
            <div className={cn(
              "flex-1 flex flex-col justify-start md:justify-center px-6 col-fade-in stagger-2",
              isShortViewport ? "py-1 sm:py-3" : "py-4 sm:py-10"
            )}>
              <h2 className={cn(
                "font-mono font-normal leading-[1.5] chat-text transition-colors duration-700",
                isShortViewport ? "text-sm sm:text-base" : "text-base sm:text-lg"
              )}>
                Ask me anything about Anthony&apos;s
                <br />
                experience, skills, and background.
              </h2>
            </div>
          )}
        </div>

        <div className={cn("sticky bottom-0 z-10 shrink-0 pb-safe px-6 bg-[var(--chat-bg)] transition-colors duration-700 relative", isShortViewport && !hasMessages ? "py-3" : "py-4")}>
          {showScrollButton && (
            <button
              onClick={() => { shouldAutoScroll.current = true; scrollToBottom(); }}
              className="absolute -top-10 right-6 p-2 transition-all duration-300 animate-scale-in chat-scroll-btn"
              aria-label="Scroll to bottom"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
          {!hasMessages ? (
            <div className={cn("grid grid-cols-2 gap-2 col-fade-in stagger-3", isShortViewport ? "mb-3" : "mb-5")}>
              {suggestedQuestions.map((question) => (
                <button
                  key={question}
                  onClick={() => handleSubmit(undefined, question)}
                  disabled={isLoading}
                  className="chat-suggestion text-left text-[12px] font-mono leading-[1.6] px-3 py-2.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {question}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-3">
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {suggestedQuestions.map((question) => (
                  <button
                    key={question}
                    onClick={() => handleSubmit(undefined, question)}
                    disabled={isLoading}
                    className="chat-suggestion shrink-0 px-3 py-1.5 text-[11px] font-mono transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {question}
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
              onClick={() => setShadowMode((prev) => !prev)}
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

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1 px-1">
      {TYPING_DELAYS.map((delay, i) => (
        <span key={i} className={cn("w-1.5 h-1.5 rounded-full chat-typing-dot animate-typing-dot transition-colors duration-700", delay)} />
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
