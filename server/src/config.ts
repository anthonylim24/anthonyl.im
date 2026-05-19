const isTruthy = (v: string | undefined) => v !== undefined && v !== 'false' && v !== '0';

export const config = {
  port: process.env.PORT || 3000,
  deepseekApiKey: process.env.KLUSTER_API_KEY,
  deepseekApiBaseUrl: process.env.KLUSTER_API_BASE_URL,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,

  groqApiKey: process.env.GROQ_API_KEY,
  apifyToken: process.env.APIFY_TOKEN,
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  googleVisionApiKey: process.env.GOOGLE_VISION_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY,
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,

  clerkSecretKey: process.env.CLERK_SECRET_KEY,
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY,

  igWorkerEnabled: isTruthy(process.env.IG_WORKER_ENABLED ?? 'true'),
  igWorkerConcurrency: Number(process.env.IG_WORKER_CONCURRENCY ?? 3),
  igWorkerPollMs: Number(process.env.IG_WORKER_POLL_MS ?? 3_000),
  igWorkerStaleSec: Number(process.env.IG_WORKER_STALE_SEC ?? 600),
} as const;

// Validate required env vars — only enforce keys for features that are enabled.
const requiredAlways = ['KLUSTER_API_KEY', 'KLUSTER_API_BASE_URL'] as const;
for (const v of requiredAlways) {
  if (!process.env[v]) throw new Error(`Missing required environment variable: ${v}`);
}

if (config.igWorkerEnabled) {
  const required = ['APIFY_TOKEN', 'GOOGLE_MAPS_API_KEY', 'GROQ_API_KEY', 'CLERK_SECRET_KEY',
                    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  for (const v of required) {
    if (!process.env[v] && !(v === 'SUPABASE_URL' && process.env.VITE_SUPABASE_URL)) {
      console.warn(`[ig-worker] env missing: ${v} — worker will fail on first job`);
    }
  }
}
