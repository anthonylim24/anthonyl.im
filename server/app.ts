import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { config } from './src/config';
import { errorHandler } from './src/middleware/error';
import invokeRouter from './src/routes/invoke';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: config.corsOrigin,
  credentials: true,
  exposeHeaders: ['Content-Type'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));
app.use('*', errorHandler);

// Add specific headers for SSE endpoint
app.use('/api/invoke/*', async (c, next) => {
  // Add headers needed for SSE
  if (c.req.method === 'POST') {
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
  }
  await next();
});

// Routes
app.route('/api/invoke', invokeRouter);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Error handling for 404
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Not Found',
    path: c.req.path,
  }, 404);
});

// Serve static files
if (process.env.NODE_ENV === 'production') {
  app.use('*', serveStatic({ root: './frontend/dist' }));
  app.get('*', serveStatic({ path: './frontend/dist/index.html' }));
} else {
  console.warn('Running in development mode. Static file serving is disabled.');
}

export default app;
