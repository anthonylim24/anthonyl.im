import { Button } from "@/components/ui/button";
import { Github, Linkedin } from "lucide-react";

function App() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 md:p-8">
      <main className="container flex flex-col items-center justify-center gap-12 md:gap-16">
        <div className="text-center space-y-6">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-foreground">
            Anthony <span className="text-primary">Lim</span>
          </h1>
          <div className="h-1 w-24 bg-primary mx-auto"></div>
        </div>

        <nav className="flex flex-wrap justify-center gap-4 md:gap-8">
          <Button
            variant="ghost"
            asChild
            className="text-base md:text-lg hover:text-primary"
          >
            <a href="#work">Work</a>
          </Button>
          <Button
            variant="ghost"
            asChild
            className="text-base md:text-lg hover:text-primary"
          >
            <a href="#about">About</a>
          </Button>
          <Button
            variant="ghost"
            asChild
            className="text-base md:text-lg hover:text-primary"
          >
            <a href="#contact">Contact</a>
          </Button>
        </nav>

        <div className="flex gap-4 md:gap-6">
          <Button
            variant="outline"
            size="icon"
            asChild
            className="h-12 w-12 md:h-14 md:w-14"
          >
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Github className="h-6 w-6" />
            </a>
          </Button>
          <Button
            variant="outline"
            size="icon"
            asChild
            className="h-12 w-12 md:h-14 md:w-14"
          >
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Linkedin className="h-6 w-6" />
            </a>
          </Button>
        </div>
      </main>
    </div>
  );
}

export default App;
