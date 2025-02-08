import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { config } from './src/config';
import { errorHandler } from './src/middleware/error';
import invokeRouter from './src/routes/invoke';

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

// Health check with more detailed info
app.get('/health', (c) => c.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development'
}));

// Static file serving
app.get('*', serveStatic({ 
  root: './frontend/dist',
  rewriteRequestPath: (path) => {
    // Check if path is requesting an asset
    if (path.match(/\.(js|css|png|jpg|svg)$/)) {
      return path;
    }
    // For all other routes, serve index.html
    return '/index.html';
  }
}));

export default app;
