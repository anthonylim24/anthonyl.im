/**
 * Does the chat model tell an order for Lim's toy world from everything else?
 * Run it by hand after editing `server/src/lim/world.ts` or changing the model
 * (it calls the real API; it is not part of CI):
 *
 *   GEMINI_API_KEY=… bun scripts/eval-lim-world.ts [model]
 *
 * Chat messages must be answered in prose; orders must come back as one
 * `@@world {json}` line with at least one op. Exits non-zero on any miss.
 */
process.env.KLUSTER_API_KEY ||= "eval";
process.env.KLUSTER_API_BASE_URL ||= "https://example.invalid";
const { geminiText } = await import("../server/src/geminiText");
const { SYSTEM_PROMPT } = await import("../server/src/routes/constants");
const { WORLD_MARK, worldPrompt } = await import("../server/src/lim/world");
const { limGeminiModel } = await import("../server/src/lim/model");

const model = process.argv[2] || limGeminiModel();
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is required");
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
const ORDERS = [
  "give him a kite", "give Lim sunglasses", "can he have a tiny castle?", "I want a dragon", "drop a robot", "bring him a pizza",
  "give him two apples", "how about a balloon?", "Lim deserves a medal", "put a scarf on him", "make him a sandwich", "add a snowman",
  "take him to the moon", "lets go to the beach", "send Lim to a candy land", "put him on a pirate ship", "go to a cozy library",
  "can we go to space?", "back to the studio", "make it rain", "make it snow", "make it night", "low gravity please", "stop the rain",
  "kick the ball", "kick it", "eat the bean", "feed him the jelly bean", "put the party hat on", "take the hat off", "hug the ball",
  "play with the ball", "throw the ball", "put away the ball", "tidy up", "clear everything out of his room", "surprise him with a gift",
  "give him a friend", "dress him up for a party", "make it a disco in here",
];

type Row = { kind: "chat" | "order"; message: string; ok: boolean; ms: number; out: string };
const judge = (kind: Row["kind"], out: string) => {
  const isOrder = new RegExp(`(^|\\n)[\\s\`]*${WORLD_MARK}\\s*\\{`).test(out);
  if (kind === "chat") return !isOrder;
  if (!isOrder) return false;
  try {
    const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
    return Array.isArray(JSON.parse(json).ops) && JSON.parse(json).ops.length > 0;
  } catch {
    return false;
  }
};

const jobs = [...CHAT.map((message) => ({ kind: "chat" as const, message })), ...ORDERS.map((message) => ({ kind: "order" as const, message }))];
const rows: Row[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: 5 }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const t0 = performance.now();
      let out = "";
      try {
        out = await geminiText({ apiKey, model, system: SYSTEM_PROMPT + worldPrompt(world), messages: [{ role: "user", content: job.message }], signal: AbortSignal.timeout(60_000) });
      } catch (err) {
        out = `ERROR ${err instanceof Error ? err.message : String(err)}`;
      }
      rows.push({ ...job, ok: !out.startsWith("ERROR") && judge(job.kind, out), ms: performance.now() - t0, out });
    }
  }),
);

for (const kind of ["chat", "order"] as const) {
  const set = rows.filter((r) => r.kind === kind);
  const times = set.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`${model} ${kind}: ${set.filter((r) => r.ok).length}/${set.length} correct, median ${(times[times.length >> 1] / 1000).toFixed(1)} s, max ${(times[times.length - 1] / 1000).toFixed(1)} s`);
  for (const r of set.filter((x) => !x.ok)) console.log(`  MISS ${JSON.stringify(r.message)} -> ${JSON.stringify(r.out.slice(0, 140))}`);
}
process.exit(rows.every((r) => r.ok) ? 0 : 1);
