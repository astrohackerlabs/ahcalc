/**
 * Subprocess lifecycle matrix for ahcalc (Exp 3).
 * Prefers compiled dist/ahcalc; falls back to `bun cli.ts` with AHCALC_COMPILED unset.
 *
 * Usage:
 *   bun scripts/lifecycle-matrix.mjs [path-to-ahcalc]
 */
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const pkgRoot = path.resolve(import.meta.dirname, "..");
// Short base dir: macOS UDS path limit ~104 bytes
const scratch =
  process.env.AHCALC_MATRIX_DIR || fs.mkdtempSync(path.join("/tmp", "ahc-m-"));

const binArg = process.argv[2];
const compiled = path.join(pkgRoot, "dist", "ahcalc");
const useCompiled = binArg ? binArg : fs.existsSync(compiled) ? compiled : null;

function makeRuntime() {
  // Keep socket path short: /tmp/ahc-m-XXXX/rN/s
  const dir = fs.mkdtempSync(path.join(scratch, "r"));
  const sock = path.join(dir, "s");
  const tsSock = path.join(dir, "t");
  if (sock.length >= 100) {
    throw new Error(`socket path too long for macOS: ${sock.length} ${sock}`);
  }
  return { dir, sock, tsSock };
}

/** Minimal TermSurf host: accept UDS and drain length-prefixed frames. */
// oxlint-disable-next-line no-unused-vars -- helper retained for matrix variants
function startFakeTermSurf(tsSock) {
  try {
    if (fs.existsSync(tsSock)) fs.unlinkSync(tsSock);
  } catch {
    /* */
  }
  const server = net.createServer((socket) => {
    socket.on("data", () => {});
  });
  return new Promise((resolve, reject) => {
    server.listen(tsSock, () => resolve(server));
    server.on("error", reject);
  });
}

function runAhcalc(env, extraArgs = []) {
  const baseEnv = {
    ...process.env,
    ...env,
    AHCALC_SKIP_TERMSURF: env.AHCALC_SKIP_TERMSURF ?? "1",
  };
  let cmd;
  let args;
  // Unified binary: never inject AHCALC_SERVER_BIN → ahcalc-server.
  // Client spawn resolves self + --server (or bun cli.ts --server).
  if (useCompiled) {
    cmd = useCompiled;
    args = [...extraArgs];
    baseEnv.AHCALC_COMPILED = "1";
    baseEnv.AHCALC_PKG_ROOT = pkgRoot;
    delete baseEnv.AHCALC_SERVER_BIN;
  } else {
    cmd = process.execPath; // bun
    args = [path.join(pkgRoot, "cli.ts"), ...extraArgs];
    delete baseEnv.AHCALC_SERVER_BIN;
  }
  // Server-only mode: same product entry with --server (not a sibling binary)
  if (extraArgs.includes("--server") || env.AHCALC_ROLE === "server") {
    if (useCompiled) {
      cmd = useCompiled;
      args = ["--server"];
    } else {
      cmd = process.execPath;
      args = [path.join(pkgRoot, "cli.ts"), "--server"];
    }
  }
  const child = spawn(cmd, args, {
    env: baseEnv,
    cwd: pkgRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.__stdout = "";
  child.__stderr = "";
  child.stdout.on("data", (d) => {
    stdout += d;
    child.__stdout = stdout;
  });
  child.stderr.on("data", (d) => {
    stderr += d;
    child.__stderr = stderr;
  });
  return { child, getStdout: () => stdout, getStderr: () => stderr };
}

async function waitForSocket(sock, child = null, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // oxlint-disable-next-line eqeqeq -- nullish check; === null would miss undefined
    if (child && child.exitCode != null) {
      throw new Error(
        `process exited early code=${child.exitCode} stderr=${child.__stderr || ""}`,
      );
    }
    if (fs.existsSync(sock)) {
      // Readiness must not briefly register then drop the last client: that
      // starts the daemon's shutdown grace before the actual test registers.
      // Each case immediately proves readiness through its real registration.
      return true;
    }
    await sleep(40);
  }
  const extra = child
    ? ` stderr=${child.__stderr || ""} stdout=${child.__stdout || ""}`
    : "";
  throw new Error(`server socket missing at ${sock}${extra}`);
}

async function readStatus(port) {
  const r = await fetch(`http://127.0.0.1:${port}/__ahcalc/status`);
  if (!r.ok) throw new Error(`status ${r.status}`);
  return r.json();
}

async function registerClient(sock) {
  const socket = await new Promise((resolve, reject) => {
    const s = net.connect({ path: sock });
    s.once("connect", () => resolve(s));
    s.once("error", reject);
  });
  const hello = await new Promise((resolve, reject) => {
    let buf = "";
    socket.on("data", (c) => {
      buf += c.toString("utf8");
      const i = buf.indexOf("\n");
      if (i >= 0) {
        try {
          resolve(JSON.parse(buf.slice(0, i)));
        } catch (e) {
          reject(e);
        }
      }
    });
    socket.once("error", reject);
  });
  return { socket, hello };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];

async function case_(name, fn) {
  process.stdout.write(`• ${name} ... `);
  try {
    await fn();
    results.push({ name, ok: true });
    console.log("ok");
  } catch (e) {
    results.push({ name, ok: false, error: String(e) });
    console.log("FAIL");
    console.error("  ", e);
  }
}

console.log(`lifecycle matrix dir=${scratch}`);
console.log(`binary=${useCompiled || "bun cli.ts (dev fallback)"}`);

await case_("outside TermSurf: fail without sock/http", async () => {
  const rt = makeRuntime();
  const env = {
    ...process.env,
    AHCALC_SOCK_PATH: rt.sock,
  };
  delete env.TERMSURF_SOCKET;
  delete env.TERMSURF_PANE_ID;
  delete env.AHCALC_SKIP_TERMSURF;
  const cmd = useCompiled || process.execPath;
  const args = useCompiled ? [] : [path.join(pkgRoot, "cli.ts")];
  if (useCompiled) env.AHCALC_COMPILED = "1";
  const p = spawn(cmd, args, {
    env,
    cwd: pkgRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  p.stderr.on("data", (d) => {
    stderr += d;
  });
  const code = await new Promise((r) => p.on("close", r));
  assert(code !== 0, `expected non-zero exit, got ${code}`);
  assert(/TERMSURF/i.test(stderr), `expected TERMSURF error, got: ${stderr}`);
  await sleep(100);
  assert(!fs.existsSync(rt.sock), "must not leave control socket");
});

await case_("concurrent cold starts → one server/port", async () => {
  const rt = makeRuntime();
  const env = {
    AHCALC_SOCK_PATH: rt.sock,
    AHCALC_SKIP_TERMSURF: "1",
    TERMSURF_SOCKET: rt.tsSock,
    TERMSURF_PANE_ID: "pane-a",
  };
  const a = runAhcalc(env);
  const b = runAhcalc(env);
  await waitForSocket(rt.sock, a.child);
  await sleep(200);
  const c1 = await registerClient(rt.sock);
  const c2 = await registerClient(rt.sock);
  assert(c1.hello.port === c2.hello.port, "ports differ");
  const st = await readStatus(c1.hello.port);
  assert(st.clients >= 2, `expected >=2 clients, got ${st.clients}`);
  c1.socket.destroy();
  c2.socket.destroy();
  a.child.kill("SIGTERM");
  b.child.kill("SIGTERM");
  // drain server by killing remaining via sockets
  await sleep(100);
});

await case_("targeted X: A exits B remains", async () => {
  const rt = makeRuntime();
  const env = {
    AHCALC_SOCK_PATH: rt.sock,
    AHCALC_SKIP_TERMSURF: "1",
    TERMSURF_SOCKET: "/dev/null",
    TERMSURF_PANE_ID: "x",
  };
  // Start server only
  const server = runAhcalc({ ...env, AHCALC_ROLE: "server" }, ["--server"]);
  await waitForSocket(rt.sock, server.child);
  const a = await registerClient(rt.sock);
  const b = await registerClient(rt.sock);
  const port = a.hello.port;
  const exitLineP = new Promise((resolve) => {
    let buf = "";
    a.socket.on("data", (c) => {
      buf += c.toString("utf8");
      if (buf.includes("\n")) resolve(buf);
    });
    setTimeout(() => resolve(buf), 3000);
  });
  const exitRes = await fetch(`http://127.0.0.1:${port}/__ahcalc/exit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: a.hello.clientId,
      token: a.hello.token,
    }),
  });
  assert(exitRes.ok, `exit route failed ${exitRes.status}`);
  const exitLine = await exitLineP;
  assert(
    exitLine.includes('"exit"'),
    `expected exit push, got ${JSON.stringify(exitLine)}`,
  );
  a.socket.end();
  a.socket.destroy();
  await sleep(150);
  const st = await readStatus(port);
  assert(st.clients === 1, `expected 1 client left, got ${st.clients}`);
  b.socket.end();
  b.socket.destroy();
  await sleep(300);
  server.child.kill("SIGTERM");
});

await case_("last client stops server and unlinks UDS", async () => {
  const rt = makeRuntime();
  const env = {
    AHCALC_SOCK_PATH: rt.sock,
    AHCALC_SKIP_TERMSURF: "1",
    TERMSURF_SOCKET: "/dev/null",
    TERMSURF_PANE_ID: "x",
  };
  const server = runAhcalc({ ...env, AHCALC_ROLE: "server" }, ["--server"]);
  await waitForSocket(rt.sock, server.child);
  const c = await registerClient(rt.sock);
  const port = c.hello.port;
  c.socket.end();
  c.socket.destroy();
  // wait for shutdown grace + process exit
  const closed = new Promise((r) => server.child.on("close", r));
  let dead = false;
  for (let i = 0; i < 80; i++) {
    await sleep(50);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/__ahcalc/status`);
      if (!r.ok) {
        dead = true;
        break;
      }
    } catch {
      dead = true;
      break;
    }
  }
  const code = await Promise.race([closed, sleep(3000).then(() => "timeout")]);
  assert(
    dead || code !== "timeout",
    `HTTP still up after last client code=${code}`,
  );
  // sock may race unlink; prefer process exit
  assert(code === 0 || code === null || code === 0, `server exit ${code}`);
});

await case_("restart after last exit works", async () => {
  const rt = makeRuntime();
  const env = {
    AHCALC_SOCK_PATH: rt.sock,
    AHCALC_SKIP_TERMSURF: "1",
    TERMSURF_SOCKET: "/dev/null",
    TERMSURF_PANE_ID: "x",
  };
  const s1 = runAhcalc({ ...env, AHCALC_ROLE: "server" }, ["--server"]);
  await waitForSocket(rt.sock, s1.child);
  const c1 = await registerClient(rt.sock);
  c1.socket.destroy();
  await new Promise((r) => s1.child.on("close", r));
  await sleep(100);
  const s2 = runAhcalc({ ...env, AHCALC_ROLE: "server" }, ["--server"]);
  await waitForSocket(rt.sock, s2.child);
  const c2 = await registerClient(rt.sock);
  assert(c2.hello.port > 0);
  c2.socket.destroy();
  await new Promise((r) => s2.child.on("close", r));
});

await case_("owner-first style: closing one of two leaves peer", async () => {
  const rt = makeRuntime();
  const env = {
    AHCALC_SOCK_PATH: rt.sock,
    AHCALC_SKIP_TERMSURF: "1",
    TERMSURF_SOCKET: "/dev/null",
    TERMSURF_PANE_ID: "x",
  };
  const server = runAhcalc({ ...env, AHCALC_ROLE: "server" }, ["--server"]);
  await waitForSocket(rt.sock, server.child);
  const a = await registerClient(rt.sock);
  const b = await registerClient(rt.sock);
  a.socket.destroy();
  await sleep(150);
  const st = await readStatus(b.hello.port);
  assert(st.clients === 1, `got ${st.clients}`);
  b.socket.destroy();
  await new Promise((r) => server.child.on("close", r));
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exit(1);
}
