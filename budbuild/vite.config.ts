import { defineConfig } from "vite";

// The client lives in client/ and is built into dist/client, which the
// Node server serves in production. In development Vite proxies the
// Socket.IO and API traffic to the game server (GAME_SERVER_PORT, default 3001).
const gameServer = `http://localhost:${process.env.GAME_SERVER_PORT ?? "3001"}`;

export default defineConfig({
  root: "client",
  publicDir: "public",
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: {
      "/socket.io": { target: gameServer, ws: true },
      "/api": { target: gameServer },
      "/healthz": { target: gameServer },
    },
  },
});
