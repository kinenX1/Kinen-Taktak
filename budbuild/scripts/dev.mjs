// Runs the game server (with reload) and the Vite dev server together.
import { spawn } from "node:child_process";

const procs = [
  spawn("npx", ["tsx", "watch", "server/index.ts"], { stdio: "inherit", env: { ...process.env, PORT: process.env.PORT ?? "3001" } }),
  spawn("npx", ["vite"], { stdio: "inherit" }),
];
const stop = () => procs.forEach((p) => p.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) => p.on("exit", (code) => { if (code) { stop(); process.exit(code); } }));
