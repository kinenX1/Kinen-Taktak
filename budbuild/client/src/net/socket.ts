import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "../../../shared/protocol";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Connects to the game server this page was served from. */
export function connectSocket(): GameSocket {
  return io({
    transports: ["websocket", "polling"],
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
  });
}
