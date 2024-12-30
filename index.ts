import figlet from "figlet";

const server = Bun.serve({
    port: 3000,
    fetch(req) {
      return new Response(figlet.textSync("Anthony Lim!"));
    },
  });
  
  console.log(`Listening on http://localhost:${server.port} ...`);