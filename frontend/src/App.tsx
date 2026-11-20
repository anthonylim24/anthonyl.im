import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, Moon, Plus, Sparkles, Sun, ToyBrick, Volume2, VolumeX } from "lucide-react";
import { sx } from "./lib/utils";
import { useFavicon } from "./hooks/useFavicon";
import { useLatestCallback } from "./hooks/useLatestCallback";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { getPostHogConfig } from "./lib/analytics";
import { syncThemeColor } from "./lib/themeColor";
import { chatbot } from "./styles/chatbot.stylex";
import { layout } from "./styles/common.stylex";
import { useChat } from "./chat/useChat";
import { MAKING_STEP_MS, makingLine, moodFor } from "./chat/chatMachine";
import { Composer, type ComposerHandle } from "./chat/Composer";
import { Transcript } from "./chat/Transcript";
import { SUGGESTIONS, followUps, prefillFrom } from "./chat/suggestions";
import { LimStage, type LimStageHandle } from "./chat/LimStage";
import { ToyCard, useThumbs } from "./chat/ToyCard";
import { TOY_ART } from "./chat/toyArt";
import { LimArt } from "./chat/LimArt";
import { caretPoint } from "./chat/caret";
import { konami, stuntFor, type Stunt } from "./chat/eggs";
import { sound } from "./chat/sound";
import type { LimWorld, ScoreEvent } from "./chat/scene/limScene";
import { readGraphics, saveGraphics, tierLabel, type Graphics, type Tier } from "./chat/scene/quality";
import { ITEMS, PLACES, localIntent, looksLikeWorldRequest, type WorldOp } from "./chat/world/spec";
import { loadMade, readWorldReply, rememberMade } from "./chat/world/worldApi";
import "./chat/chat.css";

const CHIP_TINTS = [chatbot.chip1, chatbot.chip2, chatbot.chip3, chatbot.chip4];
const NIGHT_KEY = "lim-chat-night";
const KNOWN = {
  items: new Set(Object.values(ITEMS).map((x) => x.spec.name)),
  places: new Set(Object.values(PLACES).map((x) => x.spec.name)),
};
const THEME = { light: "#FFF6EC", dark: "#1E1833" };
/** How long Lim stays pleased with itself after a reply. */
const CHEER_MS = 2200;
/**
 * Page shortcuts. They need Alt+Shift so typing a letter anywhere never flips
 * the lights or the sound (WCAG 2.1.4); `code` because Alt changes `key` on a Mac.
 */
const GRAPHICS: { value: Graphics; label: string; note: string }[] = [
  { value: "auto", label: "Auto", note: "As good as this device keeps smooth." },
  { value: "high", label: "High", note: "Studio light, soft shadows, reflections and bounce light." },
  { value: "low", label: "Low", note: "The flat toon look. Lightest on the battery." },
];

const SHORTCUTS = { night: { code: "KeyS", label: "Alt+Shift+S" }, sound: { code: "KeyM", label: "Alt+Shift+M" } };
/** Phones: the share of the shell the visitor gave Lim's stage by dragging the grip. */
const STAGE_KEY = "lim-stage";
const STAGE_DEFAULT = { empty: 0.5, chatting: 0.4 };
const STAGE_BIG = 0.68;
const clampShare = (f: number) => Math.min(0.85, Math.max(0.15, f));
// Wide enough for the long placeholder on one line.
const ROOMY = "(min-width: 480px)";
const hasMedia = () => typeof window.matchMedia === "function";
const watchRoomy = (onChange: () => void) => {
  if (!hasMedia()) return () => {};
  const mql = window.matchMedia(ROOMY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};
const isRoomy = () => hasMedia() && window.matchMedia(ROOMY).matches;

const readStage = () => {
  try {
    const share = Number(localStorage.getItem(STAGE_KEY));
    return share > 0 ? clampShare(share) : null;
  } catch {
    return null;
  }
};

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

/** The current time, ticking every `ms` while `on` (for the "making" lines). */
function useTicker(on: boolean, ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const tick = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(tick);
  }, [on, ms]);
  return now;
}

/* ── App ────────────────────────────────────────────── */

function App() {
  const stageRef = useRef<LimStageHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageAreaRef = useRef<HTMLDivElement>(null);
  // Where a press on the grip began, and whether it has turned into a drag.
  const grip = useRef<{ from: number; moved: boolean } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const stick = useRef(true);
  const pendingStunt = useRef<Stunt | null>(null);
  const worldChanged = useRef(false);
  const copyTimer = useRef(0);

  // `/?q=…` starts the composer with a question; it is never sent by itself.
  const [search, setSearch] = useSearchParams();
  const [prefill] = useState(() => prefillFrom(search) ?? "");
  const [night, setNight] = useState(readNight);
  const [soundOn, setSoundOn] = useState(() => sound.load());
  const [graphics, setGraphics] = useState<Graphics>(readGraphics);
  const [tier, setTier] = useState<Tier | null>(null);
  const chooseGraphics = useCallback((next: Graphics) => {
    saveGraphics(next);
    setTier(null);
    setGraphics(next);
  }, []);
  const [hasText, setHasText] = useState(prefill.length > 0);
  const [focused, setFocused] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [keyboardH, setKeyboardH] = useState<number | null>(null);
  const [played, setPlayed] = useState(false);
  const [toyOpen, setToyOpen] = useState(false);
  const [made, setMade] = useState(loadMade);
  // Lim's world as the live scene has it; null until (unless) the 3D scene is up, and again if it goes.
  const [world, setWorld] = useState<LimWorld | null>(null);
  // null: the stage follows the chat (bigger before the first message).
  const [stageShare, setStageShare] = useState<number | null>(readStage);
  const [dragging, setDragging] = useState(false);
  const roomy = useSyncExternalStore(watchRoomy, isRoomy, () => true);

  const reducedMotion = useReducedMotion();
  const toyButtonRef = useRef<HTMLButtonElement>(null);
  const thumbs = useThumbs(toyOpen && world !== null && made.items.length > 0, night, reducedMotion);
  // For screen readers: the stage itself is hidden from them.
  const onScore = useCallback((e: ScoreEvent) => {
    const what = e.kind === "hoop" ? `${e.points} points` : "a goal";
    setNotice(`${e.by === "lim" ? "Lim scored" : "You scored"} ${what}. You ${e.you}, Lim ${e.lim}.`);
  }, []);
  // With motion reduced Lim stays put: say that, rather than promise a performance.
  const honest = (ops: WorldOp[], reply: string) =>
    reducedMotion && ops.some((op) => (op.op === "act" && !["remove", "wear", "eat", "look"].includes(op.action)) || (op.op === "item" && op.then))
      ? "I'm keeping still (reduced motion is on), but it's right here."
      : reply;
  const { messages, turn, lastOutcome, busy, send, stop, regenerate, newChat, calm } = useChat({
    onSend: () => {
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
    onWorldStart: () => stageRef.current?.conjure(true),
    onWorld: (content, failed) => {
      const stage = stageRef.current;
      const { ops, reply } = content ? readWorldReply(content) : { ops: [], reply: "" };
      const ok = Boolean(stage && ops.length);
      stage?.conjure(false, ok);
      // Stopped by the visitor: nothing to add. Anything else that came to nothing, Lim owns up to.
      if (!content && !failed) return { text: "", ok: false };
      if (!stage || !ok) return { text: "I couldn't make that just now. Try me again, or pick something from the toy box.", ok: false };
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
      setNotice("Reply received.");
    },
    onError: () => setNotice("The reply didn't come through. Try again."),
  });

  const ordering = turn.phase === "ordering";
  const now = useTicker(ordering, MAKING_STEP_MS);
  const making = makingLine(turn, ordering ? Math.max(now, turn.startedAt) : 0);
  const typing = focused && hasText;
  const mood = moodFor(turn, lastOutcome, typing);
  const announce = ordering
    ? "Lim is making something."
    : turn.phase === "streaming"
      ? "Lim is writing."
      : busy
        ? "Lim is thinking."
        : notice;
  const nextQuestions = useMemo(() => followUps(messages, turn), [messages, turn]);

  useFavicon();

  // Lim is pleased with itself for a moment after a reply, then settles.
  useEffect(() => {
    if (lastOutcome !== "answered") return;
    const timer = window.setTimeout(calm, CHEER_MS);
    return () => window.clearTimeout(timer);
  }, [lastOutcome, calm]);

  // The question from `/?q=` is in the composer now; take it out of the address bar.
  useEffect(() => {
    if (!search.has("q")) return;
    setSearch(
      (params) => {
        params.delete("q");
        return params;
      },
      { replace: true },
    );
  }, [search, setSearch]);

  useEffect(() => {
    syncThemeColor(night ? "dark" : "light", THEME);
    try {
      localStorage.setItem(NIGHT_KEY, night ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, [night]);

  useEffect(() => {
    try {
      if (stageShare === null) localStorage.removeItem(STAGE_KEY);
      else localStorage.setItem(STAGE_KEY, stageShare.toFixed(3));
    } catch {
      /* private mode */
    }
  }, [stageShare]);

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

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

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

  // Lim watches the pointer; Esc stops a reply; Alt+Shift+S flips the lights; Alt+Shift+M is sound.
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
      if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey) {
        if (e.code === SHORTCUTS.night.code) {
          e.preventDefault();
          setNight((n) => !n);
        } else if (e.code === SHORTCUTS.sound.code) {
          e.preventDefault();
          toggleSound();
        }
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
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
  }, [messages, nextQuestions]);

  const jumpToLatest = () => {
    const el = logRef.current;
    if (!el) return;
    stick.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  /* ── Composer ── */

  const followCaret = useLatestCallback((el: HTMLTextAreaElement) => {
    const p = caretPoint(el);
    stageRef.current?.lookAt(p.x, p.y);
  });

  const onType = useLatestCallback((value: string) => {
    if (lastOutcome === "failed") calm();
    // Lim nods along with each keystroke, and flinches at SHOUTING.
    const text = value.trim();
    stageRef.current?.react(text.length >= 6 && /[A-Z]/.test(text) && text === text.toUpperCase() ? "shout" : "key");
  });

  /** From the toy box: straight into the world, no chat message. */
  const give = (op: WorldOp, label: string) => {
    const ok = stageRef.current?.apply([op]);
    setNotice(ok ? label : "Lim's world isn't available right now.");
  };

  const submit = useLatestCallback((text: string) => {
    // "Bounce the ball" is about the ball, not a request for a jump.
    const here = stageRef.current?.world()?.items ?? [];
    // And "can he have a tiny castle" is about the castle, not a cue to shrink.
    pendingStunt.current = localIntent(text, here, made, stageRef.current?.world()?.worn ?? []) || looksLikeWorldRequest(text) ? null : stuntFor(text);
    setToyOpen(false);
    if (!send(text)) return false;
    stick.current = true;
    return true;
  });

  const stopReply = useLatestCallback(() => {
    stop();
    setNotice("Stopped.");
  });

  const startOver = () => {
    newChat();
    composerRef.current?.clear();
    setNotice("New chat started.");
    stageRef.current?.hop();
    composerRef.current?.focus();
  };

  const copy = useLatestCallback((id: string) => {
    const m = messages.find((x) => x.id === id);
    if (!m) return;
    void navigator.clipboard?.writeText(m.content).then(() => {
      setCopiedId(id);
      setNotice("Copied to clipboard.");
      stageRef.current?.react("wink");
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId(null), 1600);
    });
  });

  const ask = useLatestCallback((text: string) => {
    if (submit(text)) composerRef.current?.clear();
  });
  const look = useCallback((el: Element) => stageRef.current?.lookAt(...center(el)), []);

  const empty = messages.length === 0;

  /* ── Stage grip (phones) ── */

  const shownShare = stageShare ?? (empty ? STAGE_DEFAULT.empty : STAGE_DEFAULT.chatting);
  const toggleStage = () => setStageShare((share) => (share !== null && share >= STAGE_BIG - 0.02 ? null : STAGE_BIG));

  const shareAt = (clientY: number) => {
    const area = stageAreaRef.current;
    const root = rootRef.current;
    if (!area || !root) return null;
    const top = area.getBoundingClientRect().top;
    return clampShare((clientY - top) / (root.getBoundingClientRect().bottom - top));
  };

  const onGripDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    grip.current = { from: e.clientY, moved: false };
  };

  const onGripMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const press = grip.current;
    if (!press || (!press.moved && Math.abs(e.clientY - press.from) < 5)) return;
    press.moved = true;
    setDragging(true);
    const share = shareAt(e.clientY);
    if (share !== null) setStageShare(share);
  };

  const onGripUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const press = grip.current;
    grip.current = null;
    if (!press) return;
    if (!press.moved && e.type === "pointerup") toggleStage();
    setDragging(false);
  };

  const onGripKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowUp: -0.05, ArrowDown: 0.05 }[e.key];
    if (step) setStageShare(clampShare(shownShare + step));
    else if (e.key === "Home") setStageShare(0.15);
    else if (e.key === "End") setStageShare(0.85);
    else if (e.key === "Enter" || e.key === " ") toggleStage();
    else return;
    e.preventDefault();
  };

  const rootStyle = {
    ...(keyboardH ? { height: keyboardH, minHeight: 0 } : null),
    ...(stageShare !== null ? { "--lim-stage": `clamp(150px, ${(stageShare * 100).toFixed(1)}%, calc(100% - 230px))` } : null),
  } as React.CSSProperties;

  /* ── Render ── */

  return (
    <div
      ref={rootRef}
      {...sx(
        chatbot.root,
        empty && chatbot.rootEmpty,
        focused && chatbot.rootCompact,
        dragging && chatbot.rootDragging,
        night ? "chatbot-dark" : "chatbot-shadow",
      )}
      style={rootStyle}
    >
      <a href="#chat-main" {...sx(chatbot.skip)}>
        Skip to conversation
      </a>
      <Backdrop />

      <header {...sx(chatbot.top, focused && chatbot.topTucked)}>
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
          aria-keyshortcuts={SHORTCUTS.night.label}
          title={`Night mode (${SHORTCUTS.night.label})`}
        >
          {night ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={toggleSound}
          {...sx(chatbot.iconButton)}
          aria-label="Lim's sounds"
          aria-pressed={soundOn}
          aria-keyshortcuts={SHORTCUTS.sound.label}
          title={`Lim's sounds (${SHORTCUTS.sound.label})`}
        >
          {soundOn ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
        </button>
        <button type="button" popoverTarget="graphics-menu" {...sx(chatbot.iconButton)} aria-label="Graphics" title="Graphics">
          <Sparkles size={18} aria-hidden="true" />
        </button>
        <div
          id="graphics-menu"
          popover="auto"
          // Keyboard users land on the current choice, where the arrow keys move between them.
          onToggle={(e) => {
            if (e.newState === "open") e.currentTarget.querySelector<HTMLInputElement>("input:checked")?.focus();
          }}
          {...sx(chatbot.graphicsMenu)}
        >
          <fieldset>
            <legend {...sx(chatbot.graphicsLegend)}>Graphics</legend>
            {GRAPHICS.map((option) => (
              <label key={option.value} {...sx(chatbot.graphicsOption)}>
                <input
                  type="radio"
                  name="graphics"
                  value={option.value}
                  checked={graphics === option.value}
                  onChange={() => chooseGraphics(option.value)}
                  {...sx(chatbot.graphicsRadio)}
                />
                <span>
                  <span {...sx(chatbot.graphicsName)}>{option.label}</span>
                  <span {...sx(chatbot.graphicsNote)}>
                    {option.value === "auto" && graphics === "auto" && tier ? `Now ${tierLabel(tier)}. ${option.note}` : option.note}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      </header>

      <div ref={stageAreaRef} {...sx(chatbot.stageArea)} aria-hidden="true" onPointerDown={() => setPlayed(true)}>
        <LimStage ref={stageRef} mood={mood} night={night} graphics={graphics} onTier={setTier} onWorld={setWorld} onScore={onScore} />
        <p {...sx(chatbot.stageCaption, (focused || !empty || played) && chatbot.stageCaptionHidden)}>
          psst — poke me, fling me, or feed me a bean
        </p>
      </div>

      <main id="chat-main" tabIndex={-1} {...sx(chatbot.panel)}>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize Lim's stage"
          aria-valuemin={15}
          aria-valuemax={85}
          aria-valuenow={Math.round(shownShare * 100)}
          tabIndex={0}
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          onKeyDown={onGripKey}
          {...sx(chatbot.grip)}
        >
          <span {...sx(chatbot.gripBar)} />
        </div>
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
                  <span {...sx(chatbot.long)}>
                    Anthony's jelly sidekick. Ask me about his work and projects, or bring me a coding question, a recipe hunt, or anything else. I'll answer
                    as best I can, with only a little wobbling.
                  </span>
                  <span {...sx(chatbot.short)}>Ask me about Anthony's work, or anything else at all.</span>
                </p>
                <div {...sx(chatbot.chips)}>
                  {SUGGESTIONS.map(({ text, short, Icon }, i) => (
                    <button
                      key={text}
                      type="button"
                      aria-label={text}
                      onClick={() => ask(text)}
                      onPointerEnter={(e) => look(e.currentTarget)}
                      onFocus={(e) => look(e.currentTarget)}
                      {...sx(chatbot.chip, CHIP_TINTS[i % CHIP_TINTS.length])}
                      style={{ animationDelay: `${460 + i * 70}ms` }}
                    >
                      <span {...sx(chatbot.chipIcon)} aria-hidden="true">
                        <Icon size={16} strokeWidth={2.2} />
                      </span>
                      <span {...sx(chatbot.long)}>{text}</span>
                      <span {...sx(chatbot.short)}>{short}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <Transcript
                messages={messages}
                making={making}
                copiedId={copiedId}
                onCopy={copy}
                onRegenerate={regenerate}
                followUps={nextQuestions}
                onAsk={ask}
                onLook={look}
              />
            )}
          </div>
        </div>

        <Composer
          ref={composerRef}
          busy={busy}
          roomy={roomy}
          initialText={prefill}
          onSubmit={submit}
          onStop={stopReply}
          onFocusChange={setFocused}
          onHasText={setHasText}
          onType={onType}
          onCaret={followCaret}
          jump={
            showJump && !empty ? (
              <button type="button" onClick={jumpToLatest} {...sx(chatbot.jump)}>
                <ArrowDown size={16} aria-hidden="true" /> Jump to latest
              </button>
            ) : null
          }
          toyButton={
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
          }
          toyPanel={
            toyOpen ? (
              <div id="toy-box" role="group" aria-label="Lim's toy box" {...sx(chatbot.toyPanel)}>
                {world ? (
                  <>
                    <p {...sx(chatbot.toyLabel)}>Give Lim</p>
                    <div {...sx(chatbot.toyGrid)}>
                      {[...Object.entries(ITEMS).map(([key, x]) => ({ spec: x.spec, art: TOY_ART[key] })), ...made.items.map((spec) => ({ spec, art: undefined }))].map(({ spec, art }) => (
                        <ToyCard
                          key={spec.name}
                          spec={spec}
                          art={art}
                          thumbs={thumbs}
                          reducedMotion={reducedMotion}
                          onGive={() => give({ op: "item", spec }, `Gave Lim: ${spec.name}.`)}
                        />
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
                      <span>Or just ask: “give Lim a kite”, “play basketball”.</span>
                      <button type="button" onClick={() => give({ op: "clear", what: "all" }, "All tidied up.")} {...sx(chatbot.toyTidy)}>
                        Tidy up
                      </button>
                    </div>
                  </>
                ) : (
                  <p {...sx(chatbot.toyLabel)}>Lim's toy box needs the live 3D scene, which isn't available here.</p>
                )}
              </div>
            ) : null
          }
          shortcuts={
            <>
              <span>
                <kbd {...sx(chatbot.kbd)}>{SHORTCUTS.night.label}</kbd> lights
              </span>
              <span>
                <kbd {...sx(chatbot.kbd)}>{SHORTCUTS.sound.label}</kbd> sound
              </span>
            </>
          }
        />
      </main>

      <div role="status" aria-live="polite" {...sx(layout.srOnly)}>
        {announce}
      </div>
    </div>
  );
}

export default App;
