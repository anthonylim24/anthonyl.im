import { useState, useRef, useCallback, lazy, Suspense } from "react";
import posthog from "posthog-js";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Loader2 } from "lucide-react";
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

posthog.init("phc_yZpQ6Ze2cZ6rAtVHUsHl8o0l4cW0X23xncC2lA6K836", {
  api_host: "https://us.i.posthog.com",
  person_profiles: "identified_only", // or 'always' to create profiles for anonymous users as well
});

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
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

  // useEffect(() => {
  //   const debouncedScroll = debounce(scrollToBottom, 300);
  //   debouncedScroll();
  //   return () => debouncedScroll.cancel();
  // }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
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
      }, 200);

      // Convert messages to the format expected by the API
      const messageHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      await invokeDeepseek(input, messageHistory, (content) => {
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

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-background bg-[#123524] to-muted/50">
      {/* <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center">
          <div className="mr-4 hidden md:flex">
            <CardTitle className="text-xl font-bold">Anthony Lim</CardTitle>
          </div>
        </div>
      </header> */}

      <main className="flex-1 container max-w-4xl mx-auto p-4 flex flex-col h-[100dvh] overflow-hidden">
        <Card className="flex-1 flex flex-col border-2 bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60 overflow-hidden">
          <CardHeader className="flex-none">
            <CardTitle>DeepChat</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 relative">
            <div
              ref={messagesContainerRef}
              className="absolute inset-0 overflow-y-auto p-4 space-y-4 pb-20"
              onScroll={handleScroll}
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex animate-in slide-in-from-bottom-2 duration-300",
                    message.role === "user" ? "justify-end" : "justify-start"
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
                      fallback={<div className="animate-pulse">Loading...</div>}
                    >
                      <MessageContent content={message.content} />
                    </Suspense>
                  </div>
                </div>
              ))}
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
                className="absolute bottom-20 right-4 p-2 rounded-full bg-primary/80 text-primary-foreground shadow-lg hover:bg-primary transition-all duration-600 animate-bounce"
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
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
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
