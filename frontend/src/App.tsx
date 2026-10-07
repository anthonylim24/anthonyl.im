import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Briefcase,
  Check,
  Copy,
  Heart,
  Mail,
  Moon,
  Plus,
  Rocket,
  RotateCcw,
  Sparkles,
  Square,
  Sun,
  Wrench,
} from "lucide-react";
import { sx } from "./lib/utils";
import { useFavicon } from "./hooks/useFavicon";
import { getPostHogConfig } from "./lib/analytics";
import { syncThemeColor } from "./lib/themeColor";
import { chatbot } from "./styles/chatbot.stylex";
import { layout } from "./styles/common.stylex";
import { useChat, type ChatMessage } from "./chat/useChat";
import { LimStage, type LimStageHandle } from "./chat/LimStage";
import { LimArt } from "./chat/LimArt";
import { caretPoint } from "./chat/caret";
import type { LimMood } from "./chat/scene/limScene";
import "./chat/chat.css";

const MessageContent = lazy(() => import("./components/message-content"));

const SUGGESTIONS = [
  { text: "What is Anthony's background?", Icon: Sparkles },
  { text: "What are his technical skills?", Icon: Wrench },
  { text: "Where has he worked?", Icon: Briefcase },
  { text: "How can I contact him?", Icon: Mail },
  { text: "What is he building right now?", Icon: Rocket },
  { text: "What's he like to work with?", Icon: Heart },
];
const CHIP_TINTS = [chatbot.chip1, chatbot.chip2, chatbot.chip3, chatbot.chip4];
const NIGHT_KEY = "lim-chat-night";
const THEME = { light: "#FFF6EC", dark: "#1E1833" };

const readNight = () => {
  try {
    return localStorage.getItem(NIGHT_KEY) === "1";
  } catch {
    return false;
  }
};

const center = (el: Element) => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2] as const;
};

/* ── Backdrop ───────────────────────────────────────── */

function Backdrop() {
  return (
    <div {...sx(chatbot.backdrop)} aria-hidden="true">
      <span {...sx(chatbot.blob, chatbot.blob1)} />
      <span {...sx(chatbot.blob, chatbot.blob2)} />
      <span {...sx(chatbot.blob, chatbot.blob3)} />
      <span {...sx(chatbot.blob, chatbot.blob4)} />
      <svg viewBox="0 0 24 24" {...sx(chatbot.doodle, chatbot.doodleSparkle)}>
        <path d="M12 1.5c.7 5.6 4.9 9.8 10.5 10.5-5.6.7-9.8 4.9-10.5 10.5C11.3 16.9 7.1 12.7 1.5 12 7.1 11.3 11.3 7.1 12 1.5Z" fill="currentColor" />
      </svg>
      <svg viewBox="0 0 24 24" {...sx(chatbot.doodle, chatbot.doodleRing)}>
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="4" />
      </svg>
      <svg viewBox="0 0 48 16" {...sx(chatbot.doodle, chatbot.doodleSquiggle)}>
        <path d="M3 8c5-7 9 7 14 0s9 7 14 0 9 7 14 0" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <svg viewBox="0 0 40 18" {...sx(chatbot.doodle, chatbot.doodlePill)}>
        <rect x="2" y="2" width="36" height="14" rx="7" fill="currentColor" />
      </svg>
      <svg viewBox="0 0 34 12" {...sx(chatbot.doodle, chatbot.doodleDots)}>
        <circle cx="5" cy="6" r="4" fill="currentColor" />
        <circle cx="17" cy="6" r="4" fill="currentColor" />
        <circle cx="29" cy="6" r="4" fill="currentColor" />
      </svg>
    </div>
  );
}

/* ── Messages ───────────────────────────────────────── */

function ThinkingDots() {
  return (
    <span {...sx(chatbot.thinking)}>
      {["#FF7E6B", "#B9A6FF", "#7FD6B5"].map((color, i) => (
        <span key={color} {...sx(chatbot.thinkingDot)} style={{ backgroundColor: color, animationDelay: `${i * 140}ms` }} />
      ))}
      <span {...sx(layout.srOnly)}>Lim is thinking</span>
    </span>
  );
}

function AssistantMessage({
  message,
  last,
  copied,
  onCopy,
  onRegenerate,
}: {
  message: ChatMessage;
  last: boolean;
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
}) {
  const { content, status } = message;
  const settled = status !== "streaming";
  return (
    <div {...sx(chatbot.row, chatbot.rowAssistant)}>
      <LimArt mood={status === "error" ? "sad" : "idle"} {...sx(chatbot.avatar)} />
      <div {...sx(chatbot.assistantCol)}>
        <div {...sx(chatbot.card, status === "error" && chatbot.cardError)}>
          {content ? (
            <Suspense fallback={<p>{content}</p>}>
              <MessageContent content={content} isStreaming={status === "streaming"} />
            </Suspense>
          ) : status === "streaming" ? (
            <ThinkingDots />
          ) : (
            <p>I stopped before saying anything.</p>
          )}
          {status === "error" && last && (
            <button type="button" onClick={onRegenerate} {...sx(chatbot.retry)}>
              <RotateCcw size={16} aria-hidden="true" /> Try again
            </button>
          )}
        </div>
        {settled && status !== "error" && (
          <div {...sx(chatbot.actions)}>
            {status === "stopped" && <span {...sx(chatbot.tag)}>Stopped</span>}
            {content && (
              <button type="button" onClick={onCopy} {...sx(chatbot.action)} aria-label={copied ? "Copied" : "Copy reply"}>
                {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </button>
            )}
            {last && (
              <button type="button" onClick={onRegenerate} {...sx(chatbot.action)}>
                <RotateCcw size={15} aria-hidden="true" /> Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── App ────────────────────────────────────────────── */

function App() {
  const stageRef = useRef<LimStageHandle>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const cheerTimer = useRef(0);
  const copyTimer = useRef(0);

  const [night, setNight] = useState(readNight);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [sad, setSad] = useState(false);
  const [cheering, setCheering] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendBeat, setSendBeat] = useState(0);
  const [keyboardH, setKeyboardH] = useState<number | null>(null);

  const { messages, status, busy, send, stop, regenerate, newChat } = useChat({
    onSend: () => {
      setSad(false);
      setCheering(false);
      setNotice("");
      stageRef.current?.hop();
    },
    onChunk: () => stageRef.current?.talk(),
    onDone: (firstReply) => {
      stageRef.current?.cheer(firstReply);
      setCheering(true);
      window.clearTimeout(cheerTimer.current);
      cheerTimer.current = window.setTimeout(() => setCheering(false), 2200);
      setNotice("Reply received.");
    },
    onError: () => {
      setSad(true);
      setNotice("The reply didn't come through. Try again.");
    },
  });

  const typing = focused && input.trim().length > 0;
  const mood: LimMood =
    status === "thinking" ? "thinking" : status === "streaming" ? "talking" : sad ? "sad" : cheering ? "happy" : typing ? "typing" : "idle";
  const announce = status === "thinking" ? "Lim is thinking." : status === "streaming" ? "Lim is writing." : notice;

  useFavicon();

  useEffect(() => {
    syncThemeColor(night ? "dark" : "light", THEME);
    try {
      localStorage.setItem(NIGHT_KEY, night ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, [night]);

  // PostHog (deferred — bundle-defer-third-party)
  useEffect(() => {
    const postHogConfig = getPostHogConfig();
    if (postHogConfig) {
      import("posthog-js")
        .then(({ default: ph }) =>
          ph.init(postHogConfig.key, {
            api_host: postHogConfig.apiHost,
            person_profiles: "identified_only",
          }),
        )
        .catch(() => {});
    }
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(cheerTimer.current);
      window.clearTimeout(copyTimer.current);
    },
    [],
  );

  // Lim watches the pointer; Esc stops a reply; S flips the lights.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") stageRef.current?.lookAt(e.clientX, e.clientY);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && busy) {
        stop();
        setNotice("Stopped.");
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "s" || e.key === "S") setNight((n) => !n);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [busy, stop]);

  // On-screen keyboards: size the shell to the visual viewport so the stage
  // (and Lim) stay above the composer instead of scrolling off.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => setKeyboardH(window.innerHeight - vv.height > 80 ? vv.height : null);
    vv.addEventListener("resize", sync);
    return () => vv.removeEventListener("resize", sync);
  }, []);

  /* ── Scroll ── */

  const onScroll = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = gap < 120;
    setShowJump(gap > 240);
  }, []);

  useLayoutEffect(() => {
    const el = logRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const jumpToLatest = () => {
    const el = logRef.current;
    if (!el) return;
    stick.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  /* ── Composer ── */

  const followCaret = () => {
    const el = inputRef.current;
    if (el) {
      const p = caretPoint(el);
      stageRef.current?.lookAt(p.x, p.y);
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    setSad(false);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    followCaret();
  };

  const submit = (text: string) => {
    if (!send(text)) return;
    setInput("");
    stick.current = true;
    setSendBeat((n) => n + 1);
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) {
      stop();
      setNotice("Stopped.");
    } else submit(input);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!busy) submit(input);
    }
  };

  const startOver = () => {
    newChat();
    setSad(false);
    setCheering(false);
    setInput("");
    setNotice("New chat started.");
    stageRef.current?.hop();
    inputRef.current?.focus();
  };

  const copy = (m: ChatMessage) => {
    void navigator.clipboard?.writeText(m.content).then(() => {
      setCopiedId(m.id);
      setNotice("Copied to clipboard.");
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId(null), 1600);
    });
  };

  const empty = messages.length === 0;
  const canSend = input.trim().length > 0;

  /* ── Render ── */

  return (
    <div
      {...sx(chatbot.root, focused && chatbot.rootCompact, night ? "chatbot-dark" : "chatbot-shadow")}
      style={keyboardH ? { height: keyboardH, minHeight: 0 } : undefined}
    >
      <a href="#chat-main" {...sx(chatbot.skip)}>
        Skip to conversation
      </a>
      <Backdrop />

      <header {...sx(chatbot.top)}>
        <Link to="/" {...sx(chatbot.iconButton, chatbot.homeLink)} aria-label="Back to anthonyl.im">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <div {...sx(chatbot.brand)}>
          <LimArt mood={mood} {...sx(chatbot.brandMark)} />
          <div {...sx(chatbot.brandText)}>
            <h1 {...sx(chatbot.brandName)}>Lim</h1>
            <span {...sx(chatbot.brandSub)}>Anthony's jelly sidekick</span>
          </div>
        </div>
        <button type="button" onClick={startOver} {...sx(chatbot.iconButton)} aria-label="New chat">
          <Plus size={18} aria-hidden="true" />
          <span {...sx(chatbot.iconButtonLabel)} aria-hidden="true">
            New chat
          </span>
        </button>
        <button
          type="button"
          onClick={() => setNight((n) => !n)}
          {...sx(chatbot.iconButton)}
          aria-label="Night mode"
          aria-pressed={night}
        >
          {night ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
      </header>

      <div {...sx(chatbot.stageArea)} aria-hidden="true">
        <LimStage ref={stageRef} mood={mood} night={night} />
        <p {...sx(chatbot.stageCaption, (focused || !empty) && chatbot.stageCaptionHidden)}>
          psst — poke me, or fling me around
        </p>
      </div>

      <main id="chat-main" tabIndex={-1} {...sx(chatbot.panel)}>
        <div
          ref={logRef}
          onScroll={onScroll}
          {...sx(chatbot.log)}
          role="log"
          aria-label="Conversation"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={busy}
        >
          <div {...sx(chatbot.logInner)}>
            {empty ? (
              <div {...sx(chatbot.empty)}>
                <span {...sx(chatbot.kicker)}>
                  <span {...sx(chatbot.kickerDot)} aria-hidden="true" /> Squishy and online
                </span>
                <h2 {...sx(chatbot.hello)}>
                  Hi, I'm <span {...sx(chatbot.helloAccent)}>Lim</span>!
                </h2>
                <p {...sx(chatbot.intro)}>
                  Anthony's jelly sidekick. Ask me about his work, his craft, or how to say hello. I'll answer as
                  best I can, with only a little wobbling.
                </p>
                <div {...sx(chatbot.chips)}>
                  {SUGGESTIONS.map(({ text, Icon }, i) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => submit(text)}
                      onPointerEnter={(e) => stageRef.current?.lookAt(...center(e.currentTarget))}
                      onFocus={(e) => stageRef.current?.lookAt(...center(e.currentTarget))}
                      {...sx(chatbot.chip, CHIP_TINTS[i % CHIP_TINTS.length])}
                      style={{ animationDelay: `${460 + i * 70}ms` }}
                    >
                      <span {...sx(chatbot.chipIcon)} aria-hidden="true">
                        <Icon size={16} strokeWidth={2.2} />
                      </span>
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={m.id} {...sx(chatbot.row, chatbot.rowUser)}>
                    <div {...sx(chatbot.userBubble)}>{m.content}</div>
                  </div>
                ) : (
                  <AssistantMessage
                    key={m.id}
                    message={m}
                    last={i === messages.length - 1}
                    copied={copiedId === m.id}
                    onCopy={() => copy(m)}
                    onRegenerate={regenerate}
                  />
                ),
              )
            )}
          </div>
        </div>

        <form onSubmit={onSubmit} {...sx(chatbot.composer)}>
          {showJump && !empty && (
            <button type="button" onClick={jumpToLatest} {...sx(chatbot.jump)}>
              <ArrowDown size={16} aria-hidden="true" /> Jump to latest
            </button>
          )}
          <div {...sx(chatbot.composerInner)}>
            <label htmlFor="chat-input" {...sx(layout.srOnly)}>
              Ask about Anthony
            </label>
            <div {...sx(chatbot.box)}>
              <textarea
                ref={inputRef}
                id="chat-input"
                rows={1}
                value={input}
                onChange={onInput}
                onKeyDown={onKeyDown}
                onKeyUp={followCaret}
                onClick={followCaret}
                onFocus={() => {
                  setFocused(true);
                  followCaret();
                }}
                onBlur={() => setFocused(false)}
                placeholder="Ask Lim about Anthony…"
                enterKeyHint="send"
                {...sx(chatbot.textarea)}
              />
              <button
                type="submit"
                {...sx(
                  chatbot.send,
                  sendBeat > 0 && (sendBeat % 2 ? chatbot.sendSquish : chatbot.sendSquishAgain),
                  !busy && !canSend && chatbot.sendIdle,
                )}
                aria-label={busy ? "Stop generating" : "Send message"}
                aria-disabled={!busy && !canSend}
              >
                {busy ? (
                  <Square size={16} fill="currentColor" aria-hidden="true" />
                ) : (
                  <ArrowUp size={20} strokeWidth={2.6} aria-hidden="true" />
                )}
              </button>
            </div>
            <p {...sx(chatbot.hint)}>
              <span>
                <kbd {...sx(chatbot.kbd)}>Enter</kbd> to send
              </span>
              <span>
                <kbd {...sx(chatbot.kbd)}>Shift</kbd>+<kbd {...sx(chatbot.kbd)}>Enter</kbd> new line
              </span>
              {busy && (
                <span>
                  <kbd {...sx(chatbot.kbd)}>Esc</kbd> to stop
                </span>
              )}
            </p>
          </div>
        </form>
      </main>

      <div role="status" aria-live="polite" {...sx(layout.srOnly)}>
        {announce}
      </div>
    </div>
  );
}

export default App;
