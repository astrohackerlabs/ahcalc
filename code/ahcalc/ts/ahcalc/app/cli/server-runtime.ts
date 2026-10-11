/**
 * Dedicated ahcalc server: UDS control plane + HTTP calc on 127.0.0.1.
 * Exits when the last client UDS connection closes.
 */
import * as fs from "node:fs";
import { bindRuntimePort } from "./runtime-port.ts";
import * as net from "node:net";

import { encodeLine, parseLine } from "./control-protocol.ts";
import {
  mintClientIdentity,
  timingSafeEqualStr,
  type ClientIdentity,
} from "./identity.ts";
import { ensureRuntimeDir, resolveControlSocketPath } from "./paths.ts";
import {
  createStaticHttpHandler,
  type StaticHttpHandler,
} from "./static-http.ts";

export interface ClientSession {
  identity: ClientIdentity;
  socket: net.Socket;
  closed: boolean;
}

export interface ServerState {
  port: number;
  clients: Map<string, ClientSession>;
  http: ReturnType<typeof Bun.serve>;
  uds: net.Server;
  socketPath: string;
  shuttingDown: boolean;
}

let globalState: ServerState | null = null;

export function getServerState(): ServerState | null {
  return globalState;
}

export function requestClientExit(
  clientId: string,
  token: string,
  reason = "ui-x",
): boolean {
  const st = globalState;
  if (!st) return false;
  const session = st.clients.get(clientId);
  if (!session || session.closed) return false;
  if (!timingSafeEqualStr(session.identity.token, token)) return false;
  try {
    session.socket.write(encodeLine({ type: "exit", reason }));
  } catch {
    /* */
  }
  // Do not remove here — client closes UDS; EOF/close unregisters.
  // If client is already half-dead, force remove after a short delay.
  setTimeout(() => {
    if (st.clients.has(clientId)) {
      removeClient(st, clientId);
    }
  }, 500);
  return true;
}

function removeClient(st: ServerState, clientId: string): void {
  const session = st.clients.get(clientId);
  if (!session) return;
  if (session.closed) {
    st.clients.delete(clientId);
    maybeShutdown(st);
    return;
  }
  session.closed = true;
  st.clients.delete(clientId);
  try {
    session.socket.destroy();
  } catch {
    /* */
  }
  maybeShutdown(st);
}

function maybeShutdown(st: ServerState): void {
  if (st.shuttingDown) return;
  if (st.clients.size > 0) return;
  setTimeout(() => {
    shutdownIfIdle(st).catch((error: unknown) => {
      console.error("ahcalc: shutdown failed", error);
      process.exit(1);
    });
  }, 50);
}

async function shutdownIfIdle(st: ServerState): Promise<void> {
  if (st.shuttingDown || st.clients.size > 0) return;
  st.shuttingDown = true;
  try {
    await st.http.stop(true);
  } catch {
    // Continue local cleanup even if the HTTP listener already stopped.
  }
  try {
    st.uds.close();
  } catch {
    // The control listener may already be closed.
  }
  try {
    if (fs.existsSync(st.socketPath)) fs.unlinkSync(st.socketPath);
  } catch {
    // Preserve best-effort socket cleanup during process exit.
  }
  globalState = null;
  process.exit(0);
}

async function handleHttp(
  request: Request,
  staticHttp: StaticHttpHandler,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/__ahcalc/exit" && request.method === "POST") {
    let body: { clientId?: string; token?: string } = {};
    try {
      body = (await request.json()) as { clientId?: string; token?: string };
    } catch {
      return Response.json(
        { ok: false, error: "invalid json" },
        { status: 400 },
      );
    }
    if (!body.clientId || !body.token) {
      return Response.json(
        { ok: false, error: "missing identity" },
        { status: 400 },
      );
    }
    const ok = requestClientExit(body.clientId, body.token, "ui-x");
    if (!ok) {
      return Response.json(
        { ok: false, error: "unknown client" },
        { status: 404 },
      );
    }
    return Response.json({ ok: true });
  }

  if (url.pathname === "/__ahcalc/status" && request.method === "GET") {
    const st = globalState;
    return Response.json({
      ok: true,
      port: st?.port ?? 0,
      clients: st?.clients.size ?? 0,
    });
  }

  try {
    return await staticHttp(request);
  } catch (error) {
    if (!(request.signal.aborted && error === request.signal.reason)) {
      console.error(error);
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}

function tryConnect(socketPath: string): Promise<net.Socket | null> {
  return new Promise((resolve) => {
    const s = net.connect({ path: socketPath });
    s.once("connect", () => {
      resolve(s);
    });
    s.once("error", () => {
      resolve(null);
    });
  });
}

export async function runServerMode(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const { dir, socket: socketPath } = resolveControlSocketPath(env);
  if (socketPath.length >= 104) {
    console.error(
      `ahcalc server: socket path too long for macOS (${String(socketPath.length)}): ${socketPath}`,
    );
    process.exit(1);
  }
  ensureRuntimeDir(dir);

  if (fs.existsSync(socketPath)) {
    const live = await tryConnect(socketPath);
    if (live) {
      live.end();
      console.error("ahcalc server: control socket already in use");
      process.exit(1);
    }
    try {
      fs.unlinkSync(socketPath);
    } catch {
      /* */
    }
  }

  // Static SPA from build/client — works inside compiled dist/ahcalc (no
  // node_modules / dynamic react-router import, which broke auto-spawn).
  const staticHttp = createStaticHttpHandler(env);

  const http = bindRuntimePort((port) =>
    Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch: (req) => handleHttp(req, staticHttp),
    }),
  );

  const port = http.port;
  if (!port) {
    console.error("ahcalc server: failed to bind HTTP");
    process.exit(1);
  }

  const clients = new Map<string, ClientSession>();
  const st: ServerState = {
    port,
    clients,
    http,
    uds: null as unknown as net.Server,
    socketPath,
    shuttingDown: false,
  };
  globalState = st;

  const uds = net.createServer((socket) => {
    const identity = mintClientIdentity();
    const session: ClientSession = { identity, socket, closed: false };
    clients.set(identity.clientId, session);

    socket.write(
      encodeLine({
        type: "registered",
        port,
        clientId: identity.clientId,
        token: identity.token,
      }),
    );

    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        parseLine(line);
      }
    });

    const onClose = (): void => {
      removeClient(st, identity.clientId);
    };
    socket.on("close", onClose);
    socket.on("end", onClose);
    socket.on("error", onClose);
    socket.on("timeout", onClose);
  });

  st.uds = uds;

  await new Promise<void>((resolve, reject) => {
    uds.once("error", (err) => {
      reject(
        new Error(
          `UDS listen failed at ${socketPath} (len=${String(socketPath.length)}): ${err.message}`,
        ),
      );
    });
    uds.listen(socketPath, () => {
      try {
        fs.chmodSync(socketPath, 0o600);
      } catch {
        /* */
      }
      resolve();
    });
  });

  console.log(
    `ahcalc server: http://127.0.0.1:${String(port)} uds=${socketPath}`,
  );
}
