import { useState, useRef, useEffect, lazy, Suspense, useCallback } from "react";
import { Button } from "./components/ui/button";
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScroll = useRef(true);

  useFavicon();


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
    <div className="fixed inset-0 flex flex-col bg-[#0a0a12] overflow-hidden">
      {/* Background image - preserved */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: 'url("https://i.imgur.com/sXbuKNH.jpeg")',
          filter: "brightness(0.35) saturate(0.7)",
        }}
      />

      {/* Depth gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a12]/70 via-transparent to-[#0a0a12]/90" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a12]/40 via-transparent to-transparent" />

      {/* Indigo tint wash */}
      <div className="absolute inset-0 bg-[#6366F1]/[0.03]" />

      {/* Star field layers */}
      <div className="stars" />
      <div className="stars2" />
      <div className="stars3" />

      {/* Main container */}
      <div className="relative z-10 flex flex-col h-full max-w-3xl mx-auto w-full safe-top">
        {/* Header */}
        <header className={cn(
          "shrink-0 text-center transition-all duration-700 ease-out px-4",
          hasMessages ? "py-3" : isShortViewport ? "py-3 sm:py-5" : "py-6 sm:py-10"
        )}>
          <div className={cn(
            "inline-block transition-all duration-700",
            !hasMessages && "animate-slide-up"
          )}>
            <h1 className={cn(
              "font-display font-extrabold tracking-tight transition-all duration-700",
              hasMessages
                ? "text-lg sm:text-xl text-white"
                : isShortViewport ? "text-2xl sm:text-4xl text-white" : "text-3xl sm:text-5xl text-white"
            )}>
              Anthony Lim
            </h1>
            <p className={cn(
              "text-white/35 transition-all duration-700 font-semibold tracking-wide uppercase",
              hasMessages ? "text-[10px] mt-0.5" : isShortViewport ? "text-[11px] sm:text-sm mt-1.5" : "text-xs sm:text-sm mt-2"
            )}>
              Software Engineer
            </p>
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 relative min-h-0">
          {hasMessages ? (
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="absolute inset-0 overflow-y-auto overscroll-contain px-4 pb-4 scroll-smooth"
            >
              {/* Messages */}
              <div className="space-y-4 py-2">
                {messages.map((message, index) => {
                  const isUser = message.role === "user";
                  const isLastAssistant = !isUser && index === messages.length - 1;
                  const showContent = message.content || (isLastAssistant && isLoading);

                  if (!showContent) return null;

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex animate-message-in",
                        isUser ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[88%] sm:max-w-[80%] rounded-[20px] px-4 py-3 transition-all duration-300",
                          isUser
                            ? "ml-4 text-white bg-[#6366F1] shadow-[0_8px_24px_-4px_rgba(99,102,241,0.3)]"
                            : "mr-4 text-white/90 bg-white/[0.06] backdrop-blur-sm border border-white/[0.06]"
                        )}
                      >
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
                    </div>
                  );
                })}
              </div>

              <div ref={messagesEndRef} className="h-4 shrink-0" />
            </div>
          ) : (
            <div className="h-full overflow-hidden px-4">
              <div className={cn(
                "flex flex-col items-center justify-start md:justify-center h-full",
                isShortViewport ? "py-0.5 sm:py-2" : "py-3 sm:py-8"
              )}>
                <h2 className={cn(
                  "font-display text-white leading-[0.95] tracking-tight",
                  isShortViewport ? "text-3xl sm:text-5xl mb-2" : "text-4xl sm:text-6xl mb-3"
                )}>
                  Ask me anything
                </h2>
                <p className={cn(
                  "text-white/25 text-center max-w-sm leading-relaxed",
                  isShortViewport ? "text-xs" : "text-sm"
                )}>
                  About Anthony&apos;s experience, skills, and background
                </p>
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
              className="absolute bottom-4 right-4 p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.08] backdrop-blur-sm text-white/60 hover:text-white hover:bg-white/[0.12] transition-all duration-300 animate-scale-in hover:scale-105"
              aria-label="Scroll to bottom"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Input area */}
        <div className={cn("shrink-0 pb-safe", isShortViewport && !hasMessages ? "p-3" : "p-4")}>
          <div
            className={cn(
              "rounded-[24px] relative overflow-hidden bg-[rgba(10,10,20,0.65)] backdrop-blur-md border border-white/[0.08]",
              isShortViewport && !hasMessages ? "p-3 sm:p-4" : "p-4 sm:p-5"
            )}
          >
            {/* Suggested questions - bento grid on empty, horizontal scroll with messages */}
            {!hasMessages ? (
              <div className={cn(
                "relative z-10 grid grid-cols-2 gap-2.5",
                isShortViewport ? "mb-2" : "mb-4"
              )}>
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={question}
                    onClick={() => handleSubmit(undefined, question)}
                    disabled={isLoading}
                    className={cn(
                      "rounded-2xl text-left group",
                      isShortViewport ? "p-3" : "p-4",
                      "bg-white/[0.04] border border-white/[0.06]",
                      "hover:bg-white/[0.08] hover:border-white/[0.10]",
                      "active:scale-[0.97]",
                      "transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed",
                      "opacity-0 animate-slide-up",
                      `stagger-${index + 1}`
                    )}
                  >
                    <span className="text-xs sm:text-sm text-white/40 group-hover:text-white/75 transition-colors leading-snug">
                      {question}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="relative z-10 mb-3 overflow-hidden">
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
                  {suggestedQuestions.map((question, index) => (
                    <button
                      key={question}
                      onClick={() => handleSubmit(undefined, question)}
                      disabled={isLoading}
                      className={cn(
                        "shrink-0 px-3.5 py-1.5 text-xs rounded-xl",
                        "bg-white/[0.04] hover:bg-white/[0.08]",
                        "border border-white/[0.06] hover:border-white/[0.12]",
                        "text-white/35 hover:text-white/70",
                        "transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed",
                        "opacity-0 animate-slide-up",
                        `stagger-${index + 1}`
                      )}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input form */}
            <form onSubmit={handleSubmit} className="relative z-10">
              <div className="flex items-end gap-3 bg-white/[0.04] border border-white/[0.06] rounded-[16px] p-2 focus-within:border-white/[0.14] transition-all duration-300">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  disabled={isLoading}
                  rows={1}
                  className="flex-1 bg-transparent border-none outline-none resize-none text-white placeholder:text-white/20 text-sm sm:text-base px-3 py-2 max-h-[120px] disabled:opacity-50"
                />
                <Button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  size="icon"
                  className="shrink-0 h-10 w-10 rounded-xl bg-[#6366F1] hover:bg-[#818CF8] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </form>

            {/* Footer */}
            <p className={cn(
              "relative z-10 text-center text-[10px] text-white/15 font-medium tracking-wide",
              isShortViewport && !hasMessages ? "mt-2" : "mt-3"
            )}>
              Powered by AI · Responses may be inaccurate
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1 px-1">
      <span className="w-2 h-2 rounded-full bg-[#818CF8] animate-typing-dot" />
      <span className="w-2 h-2 rounded-full bg-[#818CF8] animate-typing-dot [animation-delay:0.15s]" />
      <span className="w-2 h-2 rounded-full bg-[#818CF8] animate-typing-dot [animation-delay:0.3s]" />
    </div>
  );
}

const skeletonStyle1 = { background: 'rgba(99,102,241,0.15)' } as const;
const skeletonStyle2 = { background: 'rgba(99,102,241,0.10)' } as const;

function MessageSkeleton() {
  return (
    <div className="space-y-2.5 animate-pulse">
      <div className="h-3 rounded-full w-3/4" style={skeletonStyle1} />
      <div className="h-3 rounded-full w-1/2" style={skeletonStyle2} />
    </div>
  );
}

export default App;
