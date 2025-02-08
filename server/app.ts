import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { config } from './src/config';
import { errorHandler } from './src/middleware/error';
import invokeRouter from './src/routes/invoke';
import { join, resolve } from "path";

const app = new Hono();

// Group middleware by functionality
const commonMiddleware = [
  logger(),
  prettyJSON(),
  cors({
    origin: config.corsOrigin,
    credentials: true,
    exposeHeaders: ['Content-Type'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
  errorHandler,
];

// Apply common middleware
app.use('*', ...commonMiddleware);

// SSE headers middleware
const sseHeaders = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache',
  'X-Accel-Buffering': 'no',
  'Connection': 'keep-alive',
} as const;

app.use('/api/invoke/*', async (c, next) => {
  Object.entries(sseHeaders).forEach(([key, value]) => {
    c.header(key, value);
  });
  await next();
});

// API Routes
app.route('/api/invoke', invokeRouter);

// Health check
app.get('/health', (c) => c.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development'
}));

const distPath = resolve(process.cwd(), 'frontend/dist');

// Serve static assets
app.use('*', serveStatic({ root: distPath }));

// Serve index.html for all other routes (SPA fallback)
app.get('*', async (c) => {
  const file = await Bun.file(join(distPath, 'index.html')).text();
  return c.html(file);
});

export default app;
