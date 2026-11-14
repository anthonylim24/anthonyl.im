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
  ToyBrick,
  Volume2,
  VolumeX,
  Wrench,
} from "lucide-react";
import { sx } from "./lib/utils";
import { useFavicon } from "./hooks/useFavicon";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { getPostHogConfig } from "./lib/analytics";
import { syncThemeColor } from "./lib/themeColor";
import { chatbot } from "./styles/chatbot.stylex";
import { layout } from "./styles/common.stylex";
import { useChat, type ChatMessage } from "./chat/useChat";
import { LimStage, type LimStageHandle } from "./chat/LimStage";
import { LimArt } from "./chat/LimArt";
import { caretPoint } from "./chat/caret";
import type { LimMood } from "./chat/scene/limScene";
import { konami, stuntFor, type Stunt } from "./chat/eggs";
import { sound } from "./chat/sound";
import type { LimWorld } from "./chat/scene/limScene";
import { ITEMS, PLACES, localIntent, looksLikeWorldRequest, type WorldOp } from "./chat/world/spec";
import { loadMade, readWorldReply, rememberMade } from "./chat/world/worldApi";
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
/** What Lim is up to while the model invents something (it can take a while). */
const MAKING = [
  "Rummaging in the toy box…",
  "Squishing it into shape…",
  "Adding a pinch of sparkle…",
  "Picking the nicest colours…",
  "Blowing on it to dry…",
  "Nearly there…",
  "This one's tricky…",
  "Still squishing…",
  "Worth the wait, promise…",
];
const CHIP_TINTS = [chatbot.chip1, chatbot.chip2, chatbot.chip3, chatbot.chip4];
const NIGHT_KEY = "lim-chat-night";
const KNOWN = {
  items: new Set(Object.values(ITEMS).map((x) => x.spec.name)),
  places: new Set(Object.values(PLACES).map((x) => x.spec.name)),
};
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
  waiting,
}: {
  message: ChatMessage;
  last: boolean;
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  /** A progress line to show instead of the dots while this reply is being made. */
  waiting?: string;
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
            waiting ? (
              <span key={waiting} {...sx(chatbot.making)}>
                {waiting}
              </span>
            ) : (
              <ThinkingDots />
            )
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
  const pendingStunt = useRef<Stunt | null>(null);
  const makingTick = useRef(0);
  const worldChanged = useRef(false);
  const cheerTimer = useRef(0);
  const copyTimer = useRef(0);

  const [night, setNight] = useState(readNight);
  const [soundOn, setSoundOn] = useState(() => sound.load());
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [sad, setSad] = useState(false);
  const [cheering, setCheering] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendBeat, setSendBeat] = useState(0);
  const [keyboardH, setKeyboardH] = useState<number | null>(null);
  const [played, setPlayed] = useState(false);
  const [toyOpen, setToyOpen] = useState(false);
  // Counts up while Lim's world model is working; 0 when it isn't.
  const [making, setMaking] = useState(0);
  const [made, setMade] = useState(loadMade);
  // Lim's world as the live scene has it; null until (unless) the 3D scene is up.
  const [world, setWorld] = useState<LimWorld | null>(null);

  const reducedMotion = useReducedMotion();
  const toyButtonRef = useRef<HTMLButtonElement>(null);
  // With motion reduced Lim stays put: say that, rather than promise a performance.
  const honest = (ops: WorldOp[], reply: string) =>
    reducedMotion && ops.some((op) => (op.op === "act" && !["remove", "wear", "eat", "look"].includes(op.action)) || (op.op === "item" && op.then))
      ? "I'm keeping still (reduced motion is on), but it's right here."
      : reply;
  const { messages, status, busy, send, stop, regenerate, newChat } = useChat({
    onSend: () => {
      setSad(false);
      setCheering(false);
      setNotice("");
      worldChanged.current = false;
      // A message that names a trick ("do a flip") gets the trick, not the hop.
      const stunt = pendingStunt.current;
      pendingStunt.current = null;
      if (!stunt || !stageRef.current?.stunt(stunt)) stageRef.current?.hop();
    },
    onChunk: () => stageRef.current?.talk(),
    // A plain order for something Lim already knows is acted out at once, with
    // no model call. Everything else goes to the model, which answers it or
    // writes an order for the world (see `onWorld`).
    intercept: async (text) => {
      const stage = stageRef.current;
      const now = stage?.world();
      const local = localIntent(text, now?.items ?? [], made, now?.worn ?? []);
      if (!stage || !now) {
        // No live scene (still loading, or no WebGL). A plain catalog order gets a straight answer;
        // anything else goes to the model, which is told the toy box is down (see `world` below).
        return local ? "My toy box isn't up right now (it needs the live 3D scene)." : null;
      }
      if (local) {
        if (!local.ops.length) return local.reply;
        if (!stage.apply(local.ops)) return "Hmm, I can't find that here.";
        worldChanged.current = true;
        return honest(local.ops, local.reply);
      }
      // Anything else is the model's call: it answers, or orders something for the world (onWorld).
      return null;
    },
    world: () => {
      const now = stageRef.current?.world();
      return now
        ? { items: now.items.map((item) => item.name), place: now.place?.name ?? "studio", weather: now.tweak?.weather }
        : { items: [], place: "studio", unavailable: true };
    },
    // The model is writing an order for Lim's world (an invention takes it a
    // while): Lim conjures and the reply shows what it's up to.
    onWorldStart: () => {
      setMaking(1);
      stageRef.current?.conjure(true);
      window.clearInterval(makingTick.current);
      makingTick.current = window.setInterval(() => setMaking((n) => n + 1), 2200);
    },
    onWorld: (content, failed) => {
      window.clearInterval(makingTick.current);
      setMaking(0);
      const stage = stageRef.current;
      const { ops, reply } = content ? readWorldReply(content) : { ops: [], reply: "" };
      const ok = Boolean(stage && ops.length);
      stage?.conjure(false, ok);
      // Stopped by the visitor: nothing to add. Anything else that came to nothing, Lim owns up to.
      if (!content && !failed) return { text: "", ok: false };
      if (!stage || !ok) return { text: "I couldn't make that just now. Try me again, or pick something from the toy box!", ok: false };
      if (!stage.apply(ops)) return { text: "Hmm, I can't find that here.", ok: false };
      worldChanged.current = true;
      setMade((m) => rememberMade(m, ops, KNOWN));
      return { text: honest(ops, reply || "Done!"), ok: true };
    },
    onDone: (firstReply, local) => {
      if (local) {
        setNotice(worldChanged.current ? "Lim's world changed." : "Lim answered.");
        return;
      }
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
  const announce = making ? "Lim is making something." : status === "thinking" ? "Lim is thinking." : status === "streaming" ? "Lim is writing." : notice;

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
      window.clearInterval(makingTick.current);
    },
    [],
  );

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      sound.setEnabled(!on);
      return !on;
    });
  }, []);

  // A hello for anyone who opens the console.
  useEffect(() => {
    console.info(
      "%c( •ᴗ• )  psst. Lim knows tricks.",
      "font: 600 14px ui-rounded, system-ui; color: #E0526A",
      "\nAsk for a flip, a spin, a dance or a nap. Feed Lim a jelly bean. Poke ten times at your own risk. ↑↑↓↓←→←→BA.",
    );
  }, []);

  // Lim watches the pointer; Esc stops a reply; S flips the lights; M is sound.
  useEffect(() => {
    const code = konami();
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") stageRef.current?.lookAt(e.clientX, e.clientY);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && toyOpen) {
        setToyOpen(false);
        // Focus goes back to the button that opened it, not into the void.
        toyButtonRef.current?.focus();
        return;
      }
      if (e.key === "Escape" && busy) {
        stop();
        setNotice("Stopped.");
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "s" || e.key === "S") setNight((n) => !n);
      if (e.key === "m" || e.key === "M") toggleSound();
      if (code(e.key)) stageRef.current?.stunt("party");
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [busy, stop, toggleSound, toyOpen]);

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
    // Lim nods along with each keystroke, and flinches at SHOUTING.
    const text = e.target.value.trim();
    stageRef.current?.react(text.length >= 6 && /[A-Z]/.test(text) && text === text.toUpperCase() ? "shout" : "key");
  };

  /** From the toy box: straight into the world, no chat message. */
  const give = (op: WorldOp, label: string) => {
    const ok = stageRef.current?.apply([op]);
    setNotice(ok ? label : "Lim's world isn't available right now.");
  };

  const submit = (text: string) => {
    // "Bounce the ball" is about the ball, not a request for a jump.
    const here = stageRef.current?.world()?.items ?? [];
    // And "can he have a tiny castle" is about the castle, not a cue to shrink.
    pendingStunt.current = localIntent(text, here, made, stageRef.current?.world()?.worn ?? []) || looksLikeWorldRequest(text) ? null : stuntFor(text);
    setToyOpen(false);
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
      stageRef.current?.react("wink");
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
        <button
          type="button"
          onClick={toggleSound}
          {...sx(chatbot.iconButton)}
          aria-label="Lim's sounds"
          aria-pressed={soundOn}
        >
          {soundOn ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
        </button>
      </header>

      <div {...sx(chatbot.stageArea)} aria-hidden="true" onPointerDown={() => setPlayed(true)}>
        <LimStage ref={stageRef} mood={mood} night={night} onWorld={setWorld} />
        <p {...sx(chatbot.stageCaption, (focused || !empty || played) && chatbot.stageCaptionHidden)}>
          psst — poke me, fling me, or feed me a bean
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
                    waiting={making && i === messages.length - 1 ? MAKING[making <= MAKING.length ? making - 1 : MAKING.length - 3 + (making % 3)] : undefined}
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
              <button
                type="button"
                onClick={() => setToyOpen((open) => !open)}
                aria-label="Toy box"
                aria-expanded={toyOpen}
                aria-controls={toyOpen ? "toy-box" : undefined}
                ref={toyButtonRef}
                {...sx(chatbot.toyButton, toyOpen && chatbot.toyButtonOn)}
              >
                <ToyBrick size={20} aria-hidden="true" />
              </button>
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
                placeholder="Ask about Anthony, or give Lim a toy…"
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
            {toyOpen && (
              <div id="toy-box" role="group" aria-label="Lim's toy box" {...sx(chatbot.toyPanel)}>
                {world ? (
                  <>
                    <p {...sx(chatbot.toyLabel)}>Give Lim</p>
                    <div {...sx(chatbot.toyChips)}>
                      {[...Object.values(ITEMS).map((x) => x.spec), ...made.items].map((spec) => (
                        <button
                          key={spec.name}
                          type="button"
                          onClick={() => give({ op: "item", spec }, `Gave Lim: ${spec.name}.`)}
                          {...sx(chatbot.toyChip)}
                        >
                          <span aria-hidden="true" {...sx(chatbot.toyDot)} style={{ backgroundColor: spec.parts[0].color }} />
                          {spec.name}
                        </button>
                      ))}
                    </div>
                    <p {...sx(chatbot.toyLabel)}>Take Lim to</p>
                    <div {...sx(chatbot.toyChips)}>
                      <button
                        type="button"
                        aria-pressed={!world.place}
                        onClick={() => give({ op: "place", spec: null }, "Back in the studio.")}
                        {...sx(chatbot.toyChip, !world.place && chatbot.toyChipOn)}
                      >
                        <span aria-hidden="true" {...sx(chatbot.toyDot)} style={{ backgroundColor: "var(--chat-rug)" }} />
                        studio
                      </button>
                      {[...Object.values(PLACES).map((x) => x.spec), ...made.places].map((spec) => (
                        <button
                          key={spec.name}
                          type="button"
                          aria-pressed={world.place?.name === spec.name}
                          onClick={() => give({ op: "place", spec }, `Lim's place: ${spec.name}.`)}
                          {...sx(chatbot.toyChip, world.place?.name === spec.name && chatbot.toyChipOn)}
                        >
                          <span aria-hidden="true" {...sx(chatbot.toyDot)} style={{ backgroundImage: `linear-gradient(${spec.sky[0]}, ${spec.floor})` }} />
                          {spec.name}
                        </button>
                      ))}
                    </div>
                    <div {...sx(chatbot.toyFoot)}>
                      <span>Or just ask: “give Lim a kite”, “make it rain”.</span>
                      <button type="button" onClick={() => give({ op: "clear", what: "all" }, "All tidied up.")} {...sx(chatbot.toyTidy)}>
                        Tidy up
                      </button>
                    </div>
                  </>
                ) : (
                  <p {...sx(chatbot.toyLabel)}>Lim's toy box needs the live 3D scene, which isn't available here.</p>
                )}
              </div>
            )}
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
