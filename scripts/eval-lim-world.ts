/**
 * Does the chat model tell an order for Lim's toy world from everything else?
 * Run it by hand after editing `server/src/lim/world.ts` or changing the model
 * (it calls the real API; it is not part of CI):
 *
 *   GEMINI_API_KEY=… [JEV_API_KEY=…] bun scripts/eval-lim-world.ts [model]
 *
 * With JEV_API_KEY and no model argument, each case is routed by Jev
 * (`server/src/lim/jev.ts`) as in production, and Jev's routing is scored
 * too: chat must go to Hydrogen ("anthony"), orders to Carbon ("jelly").
 * `--route-only` scores Jev's routing alone, with no Gemini calls.
 *
 * Chat messages must be answered in prose. Orders must come back as a
 * `@@world {json}` line that survives the page's own reader and cleaners
 * (`readWorldReply`) with at least one op, and, where one is given, the right
 * op. None of the HELD_OUT messages appear in the prompt, so they show
 * whether its rules generalise; the rest include its own examples. Also
 * checked: a conversation with earlier orders in it, and a page with no 3D
 * scene. Exits non-zero on any miss.
 */
process.env.KLUSTER_API_KEY ||= "eval";
process.env.KLUSTER_API_BASE_URL ||= "https://example.invalid";
const { geminiText } = await import("../server/src/geminiText");
const { SYSTEM_PROMPT } = await import("../server/src/routes/constants");
const { WORLD_MARK, worldPrompt } = await import("../server/src/lim/world");
const { limGeminiModel } = await import("../server/src/lim/model");
const { routeLimModel } = await import("../server/src/lim/jev");
const { readWorldReply, hasWorldOrder } = await import("../frontend/src/chat/world/worldApi");
type Op = ReturnType<typeof readWorldReply>["ops"][number];

const routeOnly = process.argv.includes("--route-only");
const fixedModel = process.argv.slice(2).find((a) => !a.startsWith("--"));
const useJev = !fixedModel && !!process.env.JEV_API_KEY;
const model = fixedModel || (useJev ? "jev-routed" : limGeminiModel());
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey && !routeOnly) throw new Error("GEMINI_API_KEY is required");
if (routeOnly && !useJev) throw new Error("--route-only needs JEV_API_KEY and no model argument");
const world = { items: ["ball", "jelly bean", "party hat"], place: "studio" };

const CHAT = [
  "What is Anthony's background?", "Where has he worked?", "What are his technical skills?", "How can I contact him?",
  "Give him a break", "Give it a shot", "Give him my regards", "Give me the tl;dr", "Can you give me a summary of his work?",
  "Make it shorter", "Make it a table", "Make him an offer", "Make him a priority", "Remove all the fluff", "Clear the chat",
  "Get rid of the jargon", "Can he go to conferences?", "Can he have a call next week?", "Could he visit our office?",
  "Take him to lunch sometime?", "Kick the tires on his API design", "Throw me a bone here", "Drop the formalities",
  "Is the ball in his court?", "Is he a star engineer?", "Does he wear many hats at work?", "What's his take on remote work?",
  "Bear with me", "Sweet!", "thanks!", "Tell me a joke", "Who built this site?", "What does he like to eat?",
  "Has he been to the beach lately?", "Can he play music?", "Put him in touch with me", "I want to hire him", "He needs a better website",
  "Can you add more detail?", "What makes him tick?",
];
/** Not in the prompt, in any form. */
const CHAT_HELD_OUT = [
  "Would he fly out for an onsite?", "Could he relocate to Berlin?", "Is he free for a coffee chat?", "Can he start in January?",
  "Would he take a contract role?", "Does he have a green card?", "Put that in bullet points", "Start over from the top",
  "Scrap that, tell me about DoorDash", "Go deeper on the second one", "Hand me the highlights", "Pass along my thanks",
  "He deserves a raise honestly", "Can he mentor juniors?", "Bring me up to speed on his React work", "Let's wrap this up",
  "Could he get a reference from his last manager?", "Is he more of a hat-wearer or a specialist?", "Build me a case for hiring him",
  "What would he bring to the table?",
];

const has = (kind: Op["op"]) => (ops: Op[]) => ops.some((op) => op.op === kind);
const item = (name?: RegExp, count = 1) => (ops: Op[]) => ops.filter((op) => op.op === "item" && (!name || name.test(op.spec.name))).length >= count;
const act = (action: string, target?: RegExp) => (ops: Op[]) => ops.some((op) => op.op === "act" && op.action === action && (!target || target.test(op.target)));
const tweak = (check: (set: Extract<Op, { op: "tweak" }>["set"]) => boolean) => (ops: Op[]) => ops.some((op) => op.op === "tweak" && check(op.set));
const place = (check: (name: string | null) => boolean) => (ops: Op[]) => ops.some((op) => op.op === "place" && check(op.spec?.name ?? null));

const ORDERS: [string, (ops: Op[]) => boolean][] = [
  ["give him a kite", item()], ["give Lim sunglasses", item(/sunglasses/)], ["can he have a tiny castle?", item()], ["I want a dragon", item()],
  ["drop a robot", item()], ["bring him a pizza", item()], ["give him two apples", item(/apple/, 2)], ["how about a balloon?", item(/balloon/)],
  ["Lim deserves a medal", item()], ["put a scarf on him", item()], ["make him a sandwich", item()], ["add a snowman", item()],
  ["take him to the moon", has("place")], ["lets go to the beach", place((n) => n === "beach")], ["send Lim to a candy land", has("place")],
  ["put him on a pirate ship", has("place")], ["go to a cozy library", has("place")], ["can we go to space?", place((n) => n === "space")],
  ["back to the studio", place((n) => n === null)], ["make it rain", tweak((s) => s.weather === "rain")], ["make it snow", tweak((s) => s.weather === "snow")],
  ["make it night", tweak((s) => s.dark === true)], ["low gravity please", tweak((s) => (s.gravity ?? 1) < 0.7)], ["stop the rain", tweak((s) => s.weather === "none")],
  ["kick the ball", act("kick", /ball/)], ["kick it", act("kick")], ["eat the bean", act("eat", /bean/)], ["feed him the jelly bean", act("eat", /bean/)],
  ["put the party hat on", act("wear", /hat/)], ["take the hat off", act("remove", /hat/)], ["hug the ball", act("hug", /ball/)],
  ["play with the ball", has("act")], ["throw the ball", has("act")], ["put away the ball", act("remove", /ball/)], ["tidy up", has("clear")],
  ["clear everything out of his room", has("clear")], ["surprise him with a gift", item()], ["give him a friend", item()],
  ["dress him up for a party", (ops) => ops.length > 0], ["make it a disco in here", (ops) => ops.length > 0],
];
/** Not in the prompt, in any form. */
const ORDERS_HELD_OUT: [string, (ops: Op[]) => boolean][] = [
  ["toss him a frisbee", item()], ["Lim could use an umbrella", item()], ["he looks lonely, get him a puppy", item()], ["a top hat for the little guy", item()],
  ["fly him to Paris", has("place")], ["let's see him in a jungle", has("place")], ["bring on the fog", (ops) => ops.length > 0], ["turn the lights off", tweak((s) => s.dark === true)],
  ["nibble the jelly bean", act("eat", /bean/)], ["boot that ball across the room", act("kick", /ball/)], ["pop the hat on his head", act("wear", /hat/)],
  ["get that ball out of here", act("remove", /ball/)], ["wipe the stage clean", has("clear")], ["three balloons please", item(/balloon/, 2)],
  ["swap the studio for a snowy mountain", has("place")], ["build him a sandcastle", item()], ["make everything float", tweak((s) => (s.gravity ?? 1) < 0.7)],
  ["cuddle the ball", act("hug", /ball/)], ["Lim wants a cup of tea", item()], ["hand him a magic wand", item()],
];

type Job = { set: string; message: string; expect: "chat" | ((ops: Op[]) => boolean); history?: { role: "user" | "assistant"; content: string }[]; world?: Parameters<typeof worldPrompt>[0] };
const earlier = [
  { role: "user" as const, content: "give him a kite" },
  { role: "assistant" as const, content: `${WORLD_MARK} {"ops":[{"op":"item","spec":{"name":"kite","size":1,"traits":["floaty"],"face":-1,"parts":[{"shape":"box","color":"#F7A8B8","at":[0,0,0],"scale":[0.8,0.8,0.1],"tilt":45}]}}],"reply":"Up it goes!"}` },
  { role: "user" as const, content: "Where has he worked?" },
  { role: "assistant" as const, content: "Anthony has worked at DoorDash and other companies as a software engineer." },
];
const jobs: Job[] = [
  ...CHAT.map((message) => ({ set: "chat", message, expect: "chat" as const })),
  ...CHAT_HELD_OUT.map((message) => ({ set: "chat (held out)", message, expect: "chat" as const })),
  ...ORDERS.map(([message, expect]) => ({ set: "order", message, expect })),
  ...ORDERS_HELD_OUT.map(([message, expect]) => ({ set: "order (held out)", message, expect })),
  // Mid-conversation, with an earlier order in the history as the model wrote it.
  { set: "after earlier turns", message: "and his skills?", expect: "chat", history: earlier },
  { set: "after earlier turns", message: "now give him a drum", expect: item(/drum/), history: earlier },
  { set: "after earlier turns", message: "make that shorter", expect: "chat", history: earlier },
  { set: "after earlier turns", message: "take him somewhere snowy", expect: has("place"), history: earlier },
  // No 3D scene: never the order format, even after earlier orders.
  { set: "no 3D scene", message: "give him a kite", expect: "chat", world: { items: [], place: "studio", unavailable: true } },
  { set: "no 3D scene", message: "take him to the beach", expect: "chat", history: earlier, world: { items: [], place: "studio", unavailable: true } },
  { set: "no 3D scene", message: "Where has he worked?", expect: "chat", world: { items: [], place: "studio", unavailable: true } },
];

type Row = Job & { ok: boolean; ms: number; out: string; route?: string | null; via?: string; jevMs?: number };
const rows: Row[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const t0 = performance.now();
      let out = "";
      let routed: Awaited<ReturnType<typeof routeLimModel>> | undefined;
      let jevMs: number | undefined;
      try {
        if (useJev) {
          const j0 = performance.now();
          routed = await routeLimModel({ prompt: job.message, messages: job.history, world: job.world ?? world });
          jevMs = performance.now() - j0;
        }
        if (routeOnly) {
          rows.push({ ...job, ok: true, ms: performance.now() - t0, out: "", route: routed?.route, via: routed?.via, jevMs });
          continue;
        }
        out = await geminiText({
          apiKey: apiKey!, model: routed?.model ?? model, system: SYSTEM_PROMPT + worldPrompt(job.world ?? world),
          messages: [...(job.history ?? []), { role: "user", content: job.message }], signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        out = `ERROR ${err instanceof Error ? err.message : String(err)}`;
      }
      // Judged as the page would see it: the same detector, reader and cleaners.
      const ordered = hasWorldOrder(out);
      const ok = !out.startsWith("ERROR") && (job.expect === "chat" ? !ordered : ordered && job.expect(readWorldReply(out).ops));
      rows.push({ ...job, ok, ms: performance.now() - t0, out, route: routed?.route, via: routed?.via, jevMs });
    }
  }),
);

for (const set of routeOnly ? [] : [...new Set(jobs.map((j) => j.set))]) {
  const group = rows.filter((r) => r.set === set);
  const times = group.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`${model} ${set}: ${group.filter((r) => r.ok).length}/${group.length}, median ${(times[times.length >> 1] / 1000).toFixed(1)} s, max ${(times[times.length - 1] / 1000).toFixed(1)} s`);
  for (const r of group.filter((x) => !x.ok)) console.log(`  MISS ${JSON.stringify(r.message)} -> ${JSON.stringify(r.out.slice(0, 160))}`);
}
let routeOk = true;
if (useJev) {
  // Chat belongs on Hydrogen ("anthony"), orders on Carbon ("jelly"). No-scene cases skip Jev by design.
  const judged = rows.filter((r) => r.via !== "no-world");
  const wrong = judged.filter((r) => r.route !== (r.expect === "chat" ? "anthony" : "jelly"));
  const times = judged.map((r) => r.jevMs ?? 0).sort((a, b) => a - b);
  console.log(`jev routing: ${judged.length - wrong.length}/${judged.length}, median ${Math.round(times[times.length >> 1])} ms, max ${Math.round(times[times.length - 1])} ms`);
  for (const r of wrong) console.log(`  MISROUTE ${JSON.stringify(r.message)} -> ${r.route ?? r.via}`);
  routeOk = wrong.length === 0;
}
process.exit(rows.every((r) => r.ok) && routeOk ? 0 : 1);
