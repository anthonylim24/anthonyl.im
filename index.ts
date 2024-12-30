import app from './server/app.ts'

const server = Bun.serve({
    port: process.env.PORT || 3000,
    fetch: app.fetch,
  });
  
  console.log(`Listening on http://localhost:${server.port} ...`);