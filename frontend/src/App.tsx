import { useState, useRef, useEffect, lazy, Suspense, useCallback } from "react";
import { Button } from "./components/ui/button";
import { Send, ChevronDown } from "lucide-react";
import { cn } from "./lib/utils";
import { invokeDeepseek } from "./lib/apiService";

const MessageContent = lazy(() => import("./components/message-content"));

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// Hoisted static constants
const suggestedQuestions = [
  "What is Anthony's background?",
  "What are his technical skills?",
  "Where has he worked?",
  "How can I contact him?",
];

// Hoisted static JSX for empty state - elegant liquid glass style
const emptyStateContent = (
  <div className="flex flex-col items-center justify-center h-full py-12 animate-scale-in">
    {/* Decorative orb behind icon */}
    <div className="relative mb-8">
      <div className="absolute inset-0 w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-[#7c8aff]/30 to-[#a78bfa]/20 blur-2xl animate-glow" />
      <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl liquid-glass-portfolio flex items-center justify-center animate-subtle-float">
        <span className="text-4xl sm:text-5xl">✨</span>
      </div>
    </div>
    <h2 className="text-xl sm:text-2xl font-semibold gradient-text mb-3">
      Welcome
    </h2>
    <p className="text-[#f8f7ff]/60 text-center text-sm sm:text-base max-w-xs px-4 leading-relaxed">
      Ask me anything about Anthony's experience, skills, or background
    </p>
  </div>
);

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScroll = useRef(true);

  // Defer PostHog loading - analytics shouldn't block initial render
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

  // Scroll to bottom function - uses scrollIntoView for better mobile support
  const scrollToBottom = (instant = false) => {
    if (messagesEndRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: instant ? "instant" : "smooth",
          block: "end",
        });
      });
    }
  };

  // Handle scroll events
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // User is near bottom if within 150px
    shouldAutoScroll.current = distanceFromBottom < 150;
    setShowScrollButton(distanceFromBottom > 200);
  };

  // Auto-scroll when messages change during streaming
  useEffect(() => {
    if (shouldAutoScroll.current) {
      scrollToBottom();
    }
  }, [messages]);

  // Auto-resize textarea - memoized to prevent recreation
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

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    // Scroll immediately after DOM update
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

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a0a12] overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: 'url("https://i.imgur.com/sXbuKNH.jpeg")',
          filter: "brightness(0.4) saturate(0.8)",
        }}
      />
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a12]/60 via-transparent to-[#0a0a12]/80" />
      {/* Subtle purple tint overlay */}
      <div className="absolute inset-0 bg-[#7c8aff]/[0.03]" />

      {/* Decorative floating orbs */}
      <div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-[#7c8aff]/10 blur-[100px] animate-orb pointer-events-none" />
      <div className="absolute bottom-40 right-10 w-80 h-80 rounded-full bg-[#a78bfa]/10 blur-[120px] animate-orb-delayed pointer-events-none" />

      {/* Main container */}
      <div className="relative z-10 flex flex-col h-full max-w-3xl mx-auto w-full">
        {/* Header with liquid glass effect */}
        <header className={cn(
          "shrink-0 text-center transition-all duration-700 ease-out px-4",
          hasMessages ? "py-4" : "py-10 sm:py-16"
        )}>
          <div className={cn(
            "inline-block transition-all duration-700",
            !hasMessages && "animate-slide-up"
          )}>
            <h1 className={cn(
              "font-bold tracking-tight transition-all duration-700",
              hasMessages
                ? "text-xl sm:text-2xl text-[#f8f7ff]"
                : "text-4xl sm:text-5xl gradient-text"
            )}>
              Anthony Lim
            </h1>
            <p className={cn(
              "text-[#f8f7ff]/50 transition-all duration-700 font-medium",
              hasMessages ? "text-xs mt-0.5" : "text-sm sm:text-base mt-3 tracking-wide"
            )}>
              Software Engineer
            </p>
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 relative min-h-0">
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="absolute inset-0 overflow-y-auto overscroll-contain px-4 pb-4 scroll-smooth"
          >
            {/* Empty state - hoisted to avoid recreation */}
            {!hasMessages && emptyStateContent}

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
                        "max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-3 transition-all duration-300",
                        isUser
                          ? "bg-gradient-to-br from-[#7c8aff] to-[#a78bfa] text-white ml-4 shadow-lg shadow-[#7c8aff]/20"
                          : "liquid-glass-portfolio text-[#f8f7ff] mr-4"
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

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <button
              onClick={() => {
                shouldAutoScroll.current = true;
                scrollToBottom();
              }}
              className="absolute bottom-4 right-4 p-2.5 rounded-xl liquid-glass-portfolio text-[#f8f7ff]/80 hover:text-[#f8f7ff] transition-all duration-300 animate-scale-in hover:scale-105"
              aria-label="Scroll to bottom"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Input area with liquid glass */}
        <div className="shrink-0 p-4 pb-safe">
          <div className="liquid-glass-portfolio rounded-2xl p-4">
            {/* Suggested questions */}
            <div className="mb-4 overflow-hidden">
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={question}
                    onClick={() => handleSubmit(undefined, question)}
                    disabled={isLoading}
                    className={cn(
                      "shrink-0 px-4 py-2 text-xs sm:text-sm rounded-xl",
                      "bg-[#7c8aff]/10 hover:bg-[#7c8aff]/20",
                      "border border-[#7c8aff]/20 hover:border-[#7c8aff]/40",
                      "text-[#f8f7ff]/70 hover:text-[#f8f7ff]",
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

            {/* Input form */}
            <form onSubmit={handleSubmit} className="relative">
              <div className="flex items-end gap-3 bg-white/[0.04] rounded-xl border border-white/[0.08] p-2 focus-within:border-[#7c8aff]/40 focus-within:bg-white/[0.06] transition-all duration-300">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  disabled={isLoading}
                  rows={1}
                  className="flex-1 bg-transparent border-none outline-none resize-none text-[#f8f7ff] placeholder:text-[#f8f7ff]/30 text-sm sm:text-base px-3 py-2 max-h-[120px] disabled:opacity-50"
                />
                <Button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  size="icon"
                  className="shrink-0 h-10 w-10 rounded-xl bg-gradient-to-r from-[#7c8aff] to-[#a78bfa] hover:from-[#8b98ff] hover:to-[#b69cfc] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-[#7c8aff]/25 hover:shadow-[#7c8aff]/40 hover:scale-105"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </form>

            {/* Footer */}
            <p className="text-center text-[10px] sm:text-xs text-[#f8f7ff]/25 mt-3">
              Powered by AI · Responses may be inaccurate
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Typing indicator component
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1 px-1">
      <span className="w-2 h-2 rounded-full bg-gradient-to-r from-[#7c8aff] to-[#a78bfa] animate-typing-dot" />
      <span className="w-2 h-2 rounded-full bg-gradient-to-r from-[#7c8aff] to-[#a78bfa] animate-typing-dot [animation-delay:0.15s]" />
      <span className="w-2 h-2 rounded-full bg-gradient-to-r from-[#7c8aff] to-[#a78bfa] animate-typing-dot [animation-delay:0.3s]" />
    </div>
  );
}

// Message skeleton for suspense
function MessageSkeleton() {
  return (
    <div className="space-y-2.5 animate-pulse">
      <div className="h-3 bg-[#7c8aff]/20 rounded-full w-3/4" />
      <div className="h-3 bg-[#7c8aff]/15 rounded-full w-1/2" />
    </div>
  );
}

export default App;
