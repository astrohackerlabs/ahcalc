/**
 * Foreground ahcalc client: ensure server, register, TermSurf overlay, wait for exit.
 */
import * as fs from "node:fs";
import * as net from "node:net";
import type { Readable } from "node:stream";

import { parseLine, type ServerHello } from "./control-protocol.ts";
import { buildCalcUrl, type ClientIdentity } from "./identity.ts";
import { isStaleSocketError, resolveControlSocketPath } from "./paths.ts";
import { readTerminalGeometry } from "./geometry.ts";
import { spawnServerBinary } from "./spawn-server.ts";
import {
  readTermSurfEnv,
  TermSurfClient,
  type OverlayOptions,
} from "./termsurf-client.ts";
import { chunkToWebBuf, watchEscInput } from "./tty-esc.ts";

const CONNECT_RETRIES = 50;
const CONNECT_DELAY_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function connectUds(socketPath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = net.connect({ path: socketPath });
    s.once("connect", () => {
      resolve(s);
    });
    s.once("error", reject);
  });
}

async function connectWithRetry(socketPath: string): Promise<net.Socket> {
  let last: unknown;
  for (let i = 0; i < CONNECT_RETRIES; i++) {
    try {
      return await connectUds(socketPath);
    } catch (e) {
      last = e;
      await sleep(CONNECT_DELAY_MS);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

function readHello(socket: net.Socket): Promise<ServerHello> {
  return new Promise((resolve, reject) => {
    let buf = "";
    // Node stream yields Buffer | string — convert to WebBuf on the next line.
    const onData = (chunk: Buffer | string): void => {
      buf += typeof chunk === "string" ? chunk : chunkToWebBuf(chunk).toUtf8();
      const idx = buf.indexOf("\n");
      if (idx < 0) return;
      const line = buf.slice(0, idx);
      socket.off("data", onData);
      const msg = parseLine(line);
      if (msg?.type === "registered") {
        resolve(msg);
      } else if (msg?.type === "error") {
        reject(new Error(msg.message));
      } else {
        reject(new Error("unexpected control hello"));
      }
    };
    socket.on("data", onData);
    socket.once("error", reject);
  });
}

function spawnServer(env: NodeJS.ProcessEnv): void {
  spawnServerBinary(env);
}

export interface ClientHandles {
  identity: ClientIdentity;
  port: number;
  control: net.Socket;
  termsurf: TermSurfClient | null;
  close: () => void;
}

export async function startClient(
  env: NodeJS.ProcessEnv = process.env,
  overlay: OverlayOptions = {},
): Promise<ClientHandles> {
  const skipTs = env.AHCALC_SKIP_TERMSURF === "1";
  const tsEnv = readTermSurfEnv(env);
  if (!skipTs && "error" in tsEnv) {
    throw new Error(tsEnv.error);
  }

  const { socket: socketPath } = resolveControlSocketPath(env);

  let control: net.Socket;
  try {
    control = await connectUds(socketPath);
  } catch (e) {
    if (isStaleSocketError(e) && fs.existsSync(socketPath)) {
      try {
        if ((e as { code?: string }).code === "ECONNREFUSED") {
          fs.unlinkSync(socketPath);
        }
      } catch {
        /* */
      }
    }
    try {
      spawnServer(env);
      control = await connectWithRetry(socketPath);
    } catch (retryErr) {
      const detail =
        retryErr instanceof Error ? retryErr.message : String(retryErr);
      throw new Error(
        `ahcalc: could not connect to control socket ${socketPath} (${detail}). ` +
          `Server auto-start failed — rebuild with build:ahcalc, or run with AHCALC_DEBUG=1. ` +
          `Outside TermSurf use: bun run --cwd code/ahcalc/ts/ahcalc dev`,
      );
    }
  }

  const hello = await readHello(control);
  const identity: ClientIdentity = {
    clientId: hello.clientId,
    token: hello.token,
  };
  const port = hello.port;
  const url = buildCalcUrl(port, identity);

  let termsurf: TermSurfClient | null = null;
  if (!skipTs && !("error" in tsEnv)) {
    const geometry = readTerminalGeometry(env);
    termsurf = await TermSurfClient.connect(tsEnv, url, geometry, overlay);
    process.on("SIGWINCH", () => {
      try {
        termsurf?.resize(readTerminalGeometry(env));
      } catch {
        /* */
      }
    });
  }

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    try {
      termsurf?.close();
    } catch {
      /* */
    }
    try {
      control.end();
      control.destroy();
    } catch {
      /* */
    }
  };

  return {
    identity,
    port,
    control,
    termsurf,
    close,
  };
}

export interface WaitForExitOptions {
  /**
   * Stream to watch for Esc (default process.stdin). Tests inject a PassThrough.
   */
  stdin?: Readable;
  /**
   * Enable TTY raw mode on the stdin stream when it is a TTY (default true for
   * process.stdin; tests typically leave the pipe non-TTY).
   */
  enableTtyRaw?: boolean;
}

/**
 * Wait until the client should exit: UDS exit push, control close, SIGINT, or Esc on PTY/stdin.
 */
export function waitForExit(
  handles: ClientHandles,
  opts: WaitForExitOptions = {},
): Promise<string> {
  return new Promise((resolve) => {
    let finished = false;
    let escWatch: ReturnType<typeof watchEscInput> | null = null;

    const cleanupSignals = (): void => {
      process.off("SIGINT", onSig);
      process.off("SIGTERM", onSig);
      try {
        escWatch?.stop();
      } catch {
        /* */
      }
      escWatch = null;
    };

    const done = (reason: string): void => {
      if (finished) return;
      finished = true;
      cleanupSignals();
      handles.close();
      resolve(reason);
    };

    const onSig = (): void => {
      done("sigint");
    };
    process.once("SIGINT", onSig);
    process.once("SIGTERM", onSig);

    const input = opts.stdin ?? process.stdin;
    const enableRaw = opts.enableTtyRaw ?? input === process.stdin;
    try {
      // Raw mode disables ISIG: Ctrl+C becomes 0x03 — map to same path as SIGINT.
      escWatch = watchEscInput(
        input,
        {
          onEsc: () => {
            done("esc");
          },
          onCtrlC: () => {
            done("sigint");
          },
        },
        { enableRawMode: enableRaw },
      );
    } catch {
      /* stdin may be unavailable; UDS/SIGINT still work */
    }

    let buf = "";
    handles.control.on("data", (chunk: Buffer | string) => {
      // Uncontrolled stream chunk → WebBuf at edge, then utf8 line buffer
      buf += typeof chunk === "string" ? chunk : chunkToWebBuf(chunk).toUtf8();
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        const msg = parseLine(line);
        if (msg?.type === "exit") {
          done(msg.reason || "exit");
        }
      }
    });
    handles.control.on("close", () => {
      done("control-closed");
    });
    handles.control.on("error", () => {
      done("control-error");
    });
  });
}
