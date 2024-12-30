import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun"

const app = new Hono();

app.use("*", logger());
app.use('*', serveStatic({ root: './frontend/dist' }));
app.use('*', serveStatic({ path: './frontend/dist/index.html' }));

app.get('/', (c) => {
  return c.json({ message: 'Hello World' });
});

export default app;
