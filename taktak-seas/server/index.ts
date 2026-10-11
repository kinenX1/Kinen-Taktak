// Entry point: starts the game server on PORT (default 3001).

import { aiConfigured, aiModel } from "./ai";
import { createGameServer } from "./app";

const port = Number(process.env.PORT) || 3001;
const server = createGameServer();

server.httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Taktak Seas is running on http://localhost:${port}`);
  console.log(
    aiConfigured()
      ? `AI builder: Claude (${aiModel()})`
      : "AI builder: offline workshop (set ANTHROPIC_API_KEY to use Claude)",
  );
});

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, shutting down`);
  const force = setTimeout(() => process.exit(0), 5000);
  force.unref();
  server.close().then(
    () => process.exit(0),
    () => process.exit(1),
  );
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
