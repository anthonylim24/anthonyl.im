import { useState, useRef, useEffect, lazy, Suspense } from "react";
import posthog from "posthog-js";
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

const suggestedQuestions = [
  "What is Anthony's background?",
  "What are his technical skills?",
  "Where has he worked?",
  "How can I contact him?",
];

posthog.init("phc_yZpQ6Ze2cZ6rAtVHUsHl8o0l4cW0X23xncC2lA6K836", {
  api_host: "https://us.i.posthog.com",
  person_profiles: "identified_only",
});

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

  // Scroll to bottom function
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
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
    if (shouldAutoScroll.current && (isStreaming || messages.length > 0)) {
      scrollToBottom();
    }
  }, [messages, isStreaming]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  };

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

    // Scroll immediately
    setTimeout(() => scrollToBottom(), 50);

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
    <div className="fixed inset-0 flex flex-col bg-[#030014] overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: 'url("https://i.imgur.com/sXbuKNH.jpeg")',
          filter: "brightness(0.5)",
        }}
      />
      {/* Overlay for better text readability */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

      {/* Main container */}
      <div className="relative z-10 flex flex-col h-full max-w-3xl mx-auto w-full">
        {/* Header */}
        <header className={cn(
          "shrink-0 text-center transition-all duration-500 ease-out px-4",
          hasMessages ? "py-3" : "py-8 sm:py-12"
        )}>
          <h1 className={cn(
            "font-bold tracking-tight text-white transition-all duration-500 drop-shadow-lg",
            hasMessages ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"
          )}>
            Anthony Lim
          </h1>
          <p className={cn(
            "text-white/70 transition-all duration-500",
            hasMessages ? "text-xs mt-0.5" : "text-sm sm:text-base mt-2"
          )}>
            Software Engineer
          </p>
        </header>

        {/* Messages area */}
        <div className="flex-1 relative min-h-0">
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="absolute inset-0 overflow-y-auto overscroll-contain px-4 pb-4 scroll-smooth"
          >
            {/* Empty state */}
            {!hasMessages && (
              <div className="flex flex-col items-center justify-center h-full py-8 animate-fade-in">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center mb-6 ring-1 ring-white/10 backdrop-blur-sm">
                  <span className="text-3xl sm:text-4xl">✨</span>
                </div>
                <p className="text-white/60 text-center text-sm sm:text-base max-w-xs px-4">
                  Ask me anything about Anthony's experience, skills, or background
                </p>
              </div>
            )}

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
                        "max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-3 shadow-lg",
                        isUser
                          ? "bg-gradient-to-br from-blue-600/90 to-blue-700/90 text-white ml-4 backdrop-blur-sm"
                          : "bg-black/40 backdrop-blur-md border border-white/10 text-white mr-4"
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

            <div ref={messagesEndRef} className="h-1" />
          </div>

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <button
              onClick={() => {
                shouldAutoScroll.current = true;
                scrollToBottom();
              }}
              className="absolute bottom-4 right-4 p-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all duration-200 animate-fade-in shadow-lg"
              aria-label="Scroll to bottom"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 p-4 pb-safe bg-black/20 backdrop-blur-md border-t border-white/5">
          {/* Suggested questions - always visible */}
          <div className="mb-3 overflow-hidden">
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
              {suggestedQuestions.map((question) => (
                <button
                  key={question}
                  onClick={() => handleSubmit(undefined, question)}
                  disabled={isLoading}
                  className="shrink-0 px-3 py-1.5 text-xs sm:text-sm rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.1] text-white/80 hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          {/* Input form */}
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex items-end gap-2 bg-white/[0.06] backdrop-blur-md rounded-2xl border border-white/[0.1] p-2 focus-within:border-blue-500/50 focus-within:bg-white/[0.08] transition-all duration-200">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                disabled={isLoading}
                rows={1}
                className="flex-1 bg-transparent border-none outline-none resize-none text-white placeholder:text-white/40 text-sm sm:text-base px-2 py-2 max-h-[120px] disabled:opacity-50"
              />
              <Button
                type="submit"
                disabled={isLoading || !input.trim()}
                size="icon"
                className="shrink-0 h-10 w-10 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-500/20"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </form>

          {/* Footer */}
          <p className="text-center text-[10px] sm:text-xs text-white/30 mt-3">
            Powered by AI · Responses may be inaccurate
          </p>
        </div>
      </div>
    </div>
  );
}

// Typing indicator component
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1 px-1">
      <span className="w-2 h-2 rounded-full bg-white/50 animate-typing-dot" />
      <span className="w-2 h-2 rounded-full bg-white/50 animate-typing-dot [animation-delay:0.15s]" />
      <span className="w-2 h-2 rounded-full bg-white/50 animate-typing-dot [animation-delay:0.3s]" />
    </div>
  );
}

// Message skeleton for suspense
function MessageSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-3 bg-white/10 rounded w-3/4" />
      <div className="h-3 bg-white/10 rounded w-1/2" />
    </div>
  );
}

export default App;
