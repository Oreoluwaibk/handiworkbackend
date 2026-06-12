import { Server } from "socket.io";

let io: Server | null = null;

export function setSocketIo(server: Server) {
  io = server;
}

export function getSocketIo(): Server | null {
  return io;
}
