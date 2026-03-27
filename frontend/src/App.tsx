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

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [shadowMode, setShadowMode] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScroll = useRef(true);

  useFavicon();

  // Shadow mode keyboard listener (press S to toggle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in input fields
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
    const updateViewportHeight = () => {
      const nextHeight = window.visualViewport?.height ?? window.innerHeight;
      setViewportHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("scroll", updateViewportHeight);

    return () => {
      window.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('posthog-js').then(({ default: posthog }) => {
        posthog.init("phc_yZpQ6Ze2cZ6rAtVHUsHl8o0l4cW0X23xncC2lA6K836", {
          api_host: "https://us.i.posthog.com",
          person_profiles: "identified_only",
        });
      });
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

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    shouldAutoScroll.current = distanceFromBottom < 150;
    setShowScrollButton(distanceFromBottom > 200);
  };

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

  return (
    <div
      className={cn(
        "fixed inset-0 flex flex-col overflow-hidden font-mono transition-colors duration-700",
        shadowMode ? "chatbot-shadow" : "chatbot-dark"
      )}
      style={{
        backgroundColor: shadowMode ? "#f2efe9" : "#080808",
      }}
    >
      {/* Shadow mode leaf overlay */}
      <div
        className="shadow-overlay"
        style={{ opacity: shadowMode ? 1 : 0 }}
        aria-hidden="true"
      >
        {/* Animated dappled light pattern */}
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="leaf-turbulence">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.015 0.025"
                numOctaves="4"
                seed="3"
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  values="0.015 0.025;0.018 0.028;0.015 0.025"
                  dur="20s"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="60"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
            <filter id="leaf-blur">
              <feGaussianBlur stdDeviation="12" />
            </filter>
          </defs>
          {/* Organic shadow shapes */}
          <g filter="url(#leaf-blur)" opacity="0.35">
            <ellipse cx="15%" cy="20%" rx="120" ry="80" fill="#3a5a2e">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;15,8;-5,12;0,0"
                dur="18s"
                repeatCount="indefinite"
              />
            </ellipse>
            <ellipse cx="75%" cy="15%" rx="100" ry="60" fill="#2d4a23">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;-12,6;8,14;0,0"
                dur="22s"
                repeatCount="indefinite"
              />
            </ellipse>
            <ellipse cx="40%" cy="45%" rx="140" ry="70" fill="#3a5a2e">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;10,-8;-8,10;0,0"
                dur="16s"
                repeatCount="indefinite"
              />
            </ellipse>
            <ellipse cx="85%" cy="60%" rx="110" ry="90" fill="#2d4a23">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;-8,12;12,-6;0,0"
                dur="24s"
                repeatCount="indefinite"
              />
            </ellipse>
            <ellipse cx="25%" cy="75%" rx="130" ry="65" fill="#3a5a2e">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;14,10;-10,8;0,0"
                dur="20s"
                repeatCount="indefinite"
              />
            </ellipse>
            <ellipse cx="60%" cy="85%" rx="100" ry="80" fill="#2d4a23">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;-6,-10;10,6;0,0"
                dur="26s"
                repeatCount="indefinite"
              />
            </ellipse>
          </g>
          {/* Smaller leaf fragments */}
          <g filter="url(#leaf-blur)" opacity="0.2">
            <circle cx="30%" cy="30%" r="40" fill="#4a6a3e">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;20,15;-10,20;0,0"
                dur="14s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="70%" cy="40%" r="35" fill="#4a6a3e">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;-15,10;10,18;0,0"
                dur="17s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="50%" cy="65%" r="50" fill="#3a5a2e">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;12,-12;-8,16;0,0"
                dur="19s"
                repeatCount="indefinite"
              />
            </circle>
          </g>
        </svg>
      </div>

      {/* Subtle grain texture */}
      <div
        className="fixed inset-0 pointer-events-none z-[2] opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
        aria-hidden="true"
      />

      {/* Main container */}
      <div className="relative z-10 flex flex-col h-full max-w-2xl mx-auto w-full safe-top">
        {/* Header */}
        <header
          className={cn(
            "shrink-0 text-left transition-all duration-700 ease-out px-6",
            hasMessages ? "py-4" : isShortViewport ? "py-4 sm:py-6" : "py-8 sm:py-14"
          )}
        >
          <div
            className={cn(
              "transition-all duration-700 col-fade-in",
            )}
          >
            {/* Name — monospace, uppercase, small */}
            <h1
              className={cn(
                "font-mono font-medium tracking-[0.07em] uppercase transition-all duration-700",
                hasMessages
                  ? "text-[10px]"
                  : "text-[10px] sm:text-[11px]",
                shadowMode ? "text-[#1a1a1a]" : "text-[#b4b4b4]"
              )}
            >
              Anthony Lim
            </h1>

            {/* Subtitle */}
            <p
              className={cn(
                "font-mono transition-all duration-700 mt-1",
                hasMessages
                  ? "text-[10px]"
                  : "text-[10px] sm:text-[11px]",
                shadowMode ? "text-[#888]" : "text-[#404040]"
              )}
            >
              Software Engineer
            </p>

            {/* Thin divider line */}
            <div
              className={cn(
                "transition-all duration-700 mt-4",
                hasMessages ? "mt-3" : "mt-5",
                shadowMode ? "border-t border-[#d8d5cf]" : "border-t border-[#181818]"
              )}
            />
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 relative min-h-0">
          {hasMessages ? (
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="absolute inset-0 overflow-y-auto overscroll-contain px-6 pb-4 scroll-smooth"
            >
              <div className="space-y-5 py-2">
                {messages.map((message, index) => {
                  const isUser = message.role === "user";
                  const isLastAssistant = !isUser && index === messages.length - 1;
                  const showContent = message.content || (isLastAssistant && isLoading);

                  if (!showContent) return null;

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "animate-message-in",
                        isUser ? "flex justify-end" : ""
                      )}
                    >
                      {isUser ? (
                        <div
                          className={cn(
                            "max-w-[85%] sm:max-w-[75%] text-[14px] leading-[1.7] font-mono px-4 py-2.5 rounded-lg transition-colors duration-700",
                            shadowMode
                              ? "bg-[#1a1a1a] text-[#f2efe9]"
                              : "bg-[#181818] text-[#e0e0e0]"
                          )}
                        >
                          {message.content}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "max-w-[92%] sm:max-w-[85%] transition-colors duration-700",
                            shadowMode ? "chatbot-shadow" : "chatbot-dark"
                          )}
                        >
                          {message.content ? (
                            <Suspense fallback={<MessageSkeleton shadowMode={shadowMode} />}>
                              <MessageContent
                                content={message.content}
                                isStreaming={isLastAssistant && isStreaming}
                                shadowMode={shadowMode}
                              />
                            </Suspense>
                          ) : (
                            <TypingIndicator shadowMode={shadowMode} />
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
            <div className="h-full overflow-hidden px-6">
              <div
                className={cn(
                  "flex flex-col justify-start md:justify-center h-full col-fade-in stagger-2",
                  isShortViewport ? "py-1 sm:py-3" : "py-4 sm:py-10"
                )}
              >
                <h2
                  className={cn(
                    "font-mono font-normal leading-[1.5] transition-colors duration-700",
                    isShortViewport ? "text-sm sm:text-base" : "text-base sm:text-lg",
                    shadowMode ? "text-[#1a1a1a]" : "text-[#b4b4b4]"
                  )}
                >
                  Ask me anything about Anthony&apos;s
                  <br />
                  experience, skills, and background.
                </h2>
              </div>
            </div>
          )}

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <button
              onClick={() => {
                shouldAutoScroll.current = true;
                scrollToBottom();
              }}
              className={cn(
                "absolute bottom-4 right-6 p-2 transition-all duration-300 animate-scale-in",
                shadowMode
                  ? "text-[#888] hover:text-[#1a1a1a] border border-[#d8d5cf] bg-[#f2efe9]"
                  : "text-[#404040] hover:text-[#b4b4b4] border border-[#181818] bg-[#080808]"
              )}
              aria-label="Scroll to bottom"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Input area */}
        <div className={cn("shrink-0 pb-safe px-6", isShortViewport && !hasMessages ? "py-3" : "py-4")}>
          {/* Suggested questions */}
          {!hasMessages ? (
            <div
              className={cn(
                "grid grid-cols-2 gap-2 col-fade-in stagger-3",
                isShortViewport ? "mb-3" : "mb-5"
              )}
            >
              {suggestedQuestions.map((question) => (
                <button
                  key={question}
                  onClick={() => handleSubmit(undefined, question)}
                  disabled={isLoading}
                  className={cn(
                    "text-left text-[12px] font-mono leading-[1.6] px-3 py-2.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed",
                    shadowMode
                      ? "text-[#888] hover:text-[#1a1a1a] border border-[#d8d5cf] hover:border-[#888]"
                      : "text-[#404040] hover:text-[#b4b4b4] border border-[#181818] hover:border-[#404040]"
                  )}
                >
                  {question}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-3 overflow-hidden">
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
                {suggestedQuestions.map((question) => (
                  <button
                    key={question}
                    onClick={() => handleSubmit(undefined, question)}
                    disabled={isLoading}
                    className={cn(
                      "shrink-0 px-3 py-1.5 text-[11px] font-mono transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed",
                      shadowMode
                        ? "text-[#888] hover:text-[#1a1a1a] border border-[#d8d5cf] hover:border-[#888]"
                        : "text-[#404040] hover:text-[#b4b4b4] border border-[#181818] hover:border-[#404040]"
                    )}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input form */}
          <form onSubmit={handleSubmit}>
            <div
              className={cn(
                "flex items-end gap-3 px-3 py-2 transition-all duration-700",
                shadowMode
                  ? "border border-[#d8d5cf] focus-within:border-[#888]"
                  : "border border-[#181818] focus-within:border-[#404040]"
              )}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                disabled={isLoading}
                rows={1}
                className={cn(
                  "flex-1 bg-transparent border-none outline-none resize-none text-[14px] font-mono leading-[1.7] px-1 py-1.5 max-h-[120px] disabled:opacity-50 transition-colors duration-700",
                  shadowMode
                    ? "text-[#1a1a1a] placeholder:text-[#ccc]"
                    : "text-[#b4b4b4] placeholder:text-[#303030]"
                )}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className={cn(
                  "shrink-0 p-2 transition-all duration-300 disabled:opacity-20 disabled:cursor-not-allowed",
                  shadowMode
                    ? "text-[#888] hover:text-[#1a1a1a]"
                    : "text-[#404040] hover:text-[#b4b4b4]"
                )}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3">
            <p
              className={cn(
                "text-[10px] font-mono tracking-[0.04em] transition-colors duration-700",
                shadowMode ? "text-[#bbb]" : "text-[#282828]"
              )}
            >
              Powered by AI · Responses may be inaccurate
            </p>
            <button
              onClick={() => setShadowMode((prev) => !prev)}
              className={cn(
                "text-[10px] font-mono tracking-[0.04em] uppercase transition-colors duration-300 hover:opacity-100",
                shadowMode ? "text-[#888] opacity-60" : "text-[#404040] opacity-40"
              )}
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

function TypingIndicator({ shadowMode }: { shadowMode: boolean }) {
  return (
    <div className="flex items-center gap-1.5 py-1 px-1">
      <span className={cn(
        "w-1.5 h-1.5 rounded-full animate-typing-dot transition-colors duration-700",
        shadowMode ? "bg-[#888]" : "bg-[#404040]"
      )} />
      <span className={cn(
        "w-1.5 h-1.5 rounded-full animate-typing-dot [animation-delay:0.15s] transition-colors duration-700",
        shadowMode ? "bg-[#888]" : "bg-[#404040]"
      )} />
      <span className={cn(
        "w-1.5 h-1.5 rounded-full animate-typing-dot [animation-delay:0.3s] transition-colors duration-700",
        shadowMode ? "bg-[#888]" : "bg-[#404040]"
      )} />
    </div>
  );
}

function MessageSkeleton({ shadowMode }: { shadowMode: boolean }) {
  return (
    <div className="space-y-2 animate-pulse">
      <div
        className="h-2.5 rounded w-3/4"
        style={{ background: shadowMode ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)" }}
      />
      <div
        className="h-2.5 rounded w-1/2"
        style={{ background: shadowMode ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)" }}
      />
    </div>
  );
}

export default App;
