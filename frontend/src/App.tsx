import { useState, useRef, useEffect } from "react";
import posthog from "posthog-js";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "./lib/utils";
import { invokeDeepseek } from "./lib/apiService";
import { MessageContent } from "./components/message-content";

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      await invokeDeepseek(input, (content) => {
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

      <main className="flex-1 container max-w-4xl mx-auto p-4 flex flex-col h-[calc(100vh-3.5rem)]">
        <Card className="flex-1 flex flex-col border-2 bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <CardHeader className="flex-none">
            <CardTitle>DeepChat</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 relative">
            <div className="absolute inset-0 overflow-y-auto p-4 space-y-4 pb-20">
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
                        ? "bg-gradient-to-br from-primary/70 via-primary/80 to-primary/90 text-primary-foreground backdrop-blur-md ml-8 hover:shadow-lg hover:shadow-primary/20 hover:border-primary/30 hover:scale-[1.02] transition-all duration-300 border border-primary/10"
                        : "bg-gradient-to-br from-card/70 via-card/80 to-card/90 border border-white/10 backdrop-blur-md mr-8 hover:shadow-lg hover:shadow-white/20 hover:border-white/30 hover:scale-[1.02] transition-all duration-300"
                    )}
                  >
                    <MessageContent content={message.content} />
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
