import { useState, useRef, useCallback, lazy, Suspense } from "react";
import posthog from "posthog-js";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent } from "./components/ui/card";
import { Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "./lib/utils";
import { invokeDeepseek } from "./lib/apiService";

// Lazy load the MessageContent component
const MessageContent = lazy(() => import("./components/message-content"));

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const suggestedQuestions = [
  "What is Anthony's work history?",
  "Where did Anthony go to school?",
  "What are Anthony's technical skills?",
  "How can I contact Anthony?",
  "What is Anthony's current role?",
];

posthog.init("phc_yZpQ6Ze2cZ6rAtVHUsHl8o0l4cW0X23xncC2lA6K836", {
  api_host: "https://us.i.posthog.com",
  person_profiles: "identified_only",
});

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } =
      messagesContainerRef.current;
    const hasScrollableContent = scrollHeight > clientHeight;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(hasScrollableContent && !isNearBottom);
  }, []);

  const handleSubmit = async (e?: React.FormEvent, submittedInput?: string) => {
    if (e) {
      e.preventDefault();
    }

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

    try {
      setTimeout(() => {
        scrollToBottom();
      }, 800);

      const messageHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      await invokeDeepseek(messageToSend, messageHistory, (content) => {
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === "assistant") {
            lastMessage.content = content;
          }
          return newMessages;
        });
      });

      setIsLoading(false);
    } catch (error) {
      console.error(error);
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage.role === "assistant") {
          lastMessage.content =
            "An error occurred while processing your request.";
        }
        return newMessages;
      });
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    handleSubmit(undefined, question);
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      {/* Add background container */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat z-0"
        style={{
          backgroundImage: 'url("https://i.imgur.com/sXbuKNH.jpeg")',
          filter: "brightness(0.6)",
        }}
      />
      {/* Add overlay */}
      <div className="fixed inset-0 bg-background/40 backdrop-blur-sm z-10" />

      {/* Update main container to be above background */}
      <main className="flex-1 container max-w-4xl mx-auto px-4 flex flex-col p-2 relative z-20">
        <div className="text-center space-y-2 py-2">
          <h1 className="text-4xl font-bold tracking-tighter">
            Ask anything about Anthony Lim
          </h1>
          <p className="text-muted-foreground">
            Get to know more about Anthony's professional experience and
            background
          </p>
        </div>

        <Card className="flex-1 flex flex-col border-2 bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60 overflow-hidden">
          <CardContent className="flex-1 flex flex-col p-0 relative">
            <div
              ref={messagesContainerRef}
              className={cn(
                "absolute inset-0 overflow-y-auto p-4 space-y-4",
                showSuggestions ? "pb-48" : "pb-32"
              )}
              onScroll={handleScroll}
            >
              {messages.map(
                (message) =>
                  message.content && (
                    <div
                      key={message.id}
                      className={cn(
                        "flex animate-in slide-in-from-bottom-2 duration-300",
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-lg p-4 shadow-md transition-colors backdrop-blur bg-opacity-60 supports-[backdrop-filter]:bg-opacity-40",
                          message.role === "user"
                            ? "bg-gradient-to-br from-primary/70 via-primary/80 to-primary/90 text-primary-foreground backdrop-blur-md ml-8 hover:shadow-lg hover:shadow-primary/20 hover:border-primary/30 transition-all duration-300 border border-primary/10"
                            : "bg-gradient-to-br from-card/70 via-card/80 to-card/90 border border-white/10 backdrop-blur-md mr-8 hover:shadow-lg hover:shadow-gray/20 hover:border-white/30 transition-all duration-300"
                        )}
                      >
                        <Suspense
                          fallback={
                            <div className="animate-pulse">Loading...</div>
                          }
                        >
                          <MessageContent content={message.content} />
                        </Suspense>
                      </div>
                    </div>
                  )
              )}
              {isLoading && (
                <div className="flex justify-start animate-in fade-in-0 duration-300">
                  <div className="bg-card border rounded-lg p-4 flex items-center gap-2 mr-8">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">
                      Thinking...
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {showScrollButton && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-36 right-4 p-2 rounded-full bg-primary/80 text-primary-foreground shadow-lg hover:bg-primary transition-all duration-600 animate-bounce"
                aria-label="Scroll to bottom"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-4 space-y-4 bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t">
              <div className="md:hidden flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Suggested Questions</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0 h-8 w-8"
                  onClick={() => setShowSuggestions(!showSuggestions)}
                >
                  {showSuggestions ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div
                className={cn(
                  "relative",
                  !showSuggestions && "hidden md:block"
                )}
              >
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background/80 to-transparent pointer-events-none z-10" />
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background/80 to-transparent pointer-events-none z-10" />
                <div
                  className={cn(
                    "flex gap-2 overflow-x-auto pb-2 px-2 no-scrollbar",
                    "md:flex-wrap md:justify-center md:overflow-x-visible md:px-0",
                    "scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                  )}
                >
                  {suggestedQuestions.map((question) => (
                    <Button
                      key={question}
                      variant="outline"
                      className="text-sm whitespace-nowrap flex-shrink-0 md:flex-shrink"
                      onClick={() => handleSuggestedQuestion(question)}
                    >
                      {question}
                    </Button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything about Anthony..."
                  className="flex-1"
                  disabled={isLoading}
                />
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Send
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default App;
