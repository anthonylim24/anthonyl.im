import { useState, useRef, useEffect } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "./lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

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

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInput("");
    setIsLoading(true);

    // TODO: Replace with actual API call
    const mockResponse: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "This is a mock response. Implement your API integration here.",
      timestamp: Date.now(),
    };

    setTimeout(() => {
      setMessages((prev) => [...prev, mockResponse]);
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center">
          <div className="mr-4 hidden md:flex">
            <CardTitle className="text-xl font-bold">Anthony Lim</CardTitle>
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-4xl mx-auto p-4 pt-8">
        <Card className="border-2">
          <CardHeader>
            <CardTitle>Chat Interface</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[600px] overflow-y-auto p-4 space-y-4">
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
                      "max-w-[85%] rounded-lg p-4 shadow-md transition-colors",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground ml-8"
                        : "bg-card border mr-8"
                    )}
                  >
                    <div className="prose prose-sm dark:prose-invert break-words">
                      {message.content}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start animate-in fade-in-0 duration-300">
                  <div className="bg-card border rounded-lg p-4 flex items-center gap-2 mr-8">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="pt-4 border-t mt-4">
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
