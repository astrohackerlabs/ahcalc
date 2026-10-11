/**
 * Exp 5 + unified binary: start dist/ahcalc --server with a *non-package* cwd
 * (monorepo root), assert home + built client chunks + CSS + logo via
 * AHCALC_PKG_ROOT.
 *
 * Usage: bun scripts/compiled-server-probe.mjs
 */
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const pkgRoot = path.resolve(import.meta.dirname, "..");
const monorepoRoot = path.resolve(pkgRoot, "../../../..");
const productBin = path.join(pkgRoot, "dist", "ahcalc");
const spaIndex = path.join(pkgRoot, "build", "client", "index.html");

// Exp 5: wrong cwd is the bug. Prefer monorepo root; fall back to OS tmp.
const spawnCwd = monorepoRoot;
const ownedDirs = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(
  fs.existsSync(productBin),
  `missing ${productBin} — run bun run build:ahcalc`,
);
assert(
  path.basename(productBin) === "ahcalc",
  `probe must use unified product binary ahcalc, got ${productBin}`,
);
assert(
  !productBin.includes("ahcalc-server"),
  "probe must not use ahcalc-server sibling",
);
assert(
  fs.existsSync(spaIndex),
  `missing SPA client ${spaIndex} — run bun run build:ahcalc`,
);
assert(
  fs.existsSync(path.join(pkgRoot, "public", "styles", "ahcalc.css")),
  `missing ${pkgRoot}/public/styles/ahcalc.css`,
);
assert(
  path.resolve(spawnCwd) !== path.resolve(pkgRoot),
  `probe cwd must not be package root (got ${spawnCwd})`,
);

// Prefer goal scratch if provided, else short /tmp-like under monorepo (not shared /tmp for sock only)
const scratchBase =
  process.env.AHCALC_PROBE_SCRATCH ||
  path.join(pkgRoot, "dist", ".probe-scratch");
fs.mkdirSync(scratchBase, { recursive: true });
const scratch = fs.mkdtempSync(path.join(scratchBase, "p-"));
ownedDirs.push(scratch);
const sock = path.join(scratch, "s");
// Keep UDS short for macOS — if too long, use /tmp short path
let sockPath = sock;
if (sockPath.length >= 100) {
  const short = fs.mkdtempSync(path.join("/tmp", "ahc-p-"));
  ownedDirs.push(short);
  sockPath = path.join(short, "s");
}
assert(sockPath.length < 100, `socket path too long: ${sockPath}`);

console.log(`probe: pkgRoot=${pkgRoot}`);
console.log(`probe: spawnCwd=${spawnCwd} (non-package)`);
console.log(`probe: sock=${sockPath}`);

const child = spawn(productBin, ["--server"], {
  cwd: spawnCwd,
  env: {
    ...process.env,
    AHCALC_SOCK_PATH: sockPath,
    AHCALC_PKG_ROOT: pkgRoot,
    AHCALC_ROLE: "server",
    AHCALC_COMPILED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (d) => {
  stdout += d;
});
child.stderr.on("data", (d) => {
  stderr += d;
});

function cleanup() {
  try {
    child.kill("SIGTERM");
  } catch {
    /* */
  }
  try {
    for (const dir of ownedDirs)
      fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* */
  }
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

async function waitForSocket(ms = 10000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // oxlint-disable-next-line eqeqeq -- nullish check; === null would miss undefined
    if (child.exitCode != null) {
      throw new Error(
        `server exited early code=${child.exitCode}\nstderr=${stderr}\nstdout=${stdout}`,
      );
    }
    if (fs.existsSync(sockPath)) {
      try {
        await new Promise((resolve, reject) => {
          const s = net.connect({ path: sockPath });
          s.once("connect", () => {
            s.end();
            resolve();
          });
          s.once("error", reject);
        });
        return;
      } catch {
        /* retry */
      }
    }
    await sleep(40);
  }
  throw new Error(`socket missing\nstderr=${stderr}\nstdout=${stdout}`);
}

try {
  await waitForSocket();

  const socket = await new Promise((resolve, reject) => {
    const s = net.connect({ path: sockPath });
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
  const port = hello.port;
  assert(port > 0, `bad port ${port}`);
  console.log(`probe: server http://127.0.0.1:${port}`);

  const home = await fetch(`http://127.0.0.1:${port}/`);
  assert(home.ok, `GET / → ${home.status}`);
  const html = await home.text();
  assert(
    html.length > 200,
    `home body empty or tiny (len=${html.length}) — SSR likely failed`,
  );
  assert(
    html.includes("<html"),
    `home missing ahcalc SPA shell (len=${html.length}): ${html.slice(0, 200)}`,
  );
  assert(!html.includes("$bunfs"), "HTML must not reference $bunfs paths");
  assert(
    !/src="\/assets\/root\/ahcalc-server"/.test(html),
    "HTML must not use collapsed compile path as script src",
  );
  assert(
    html.includes("/images/astrohacker-7-dark"),
    "HTML must reference logo images",
  );
  assert(
    /\/assets\/(?:app\/assets\/)?entry\.client-[^"']+\.js/.test(html),
    "HTML missing client entry",
  );

  // --- Exp 5: CSS + logo (fail closed) ---
  const css = await fetch(`http://127.0.0.1:${port}/styles/ahcalc.css`);
  assert(css.ok, `GET /styles/ahcalc.css → ${css.status} (cwd=${spawnCwd})`);
  const cssBody = await css.text();
  assert(
    cssBody.includes(".ahcalc-keypad"),
    "CSS missing .ahcalc-keypad oracle",
  );
  assert(
    cssBody.includes("--ah-background"),
    "CSS missing --ah-background oracle",
  );
  console.log(`  ok /styles/ahcalc.css (${cssBody.length} bytes)`);

  const logo = await fetch(
    `http://127.0.0.1:${port}/images/astrohacker-7-dark-64.webp`,
  );
  assert(logo.ok, `GET /images/astrohacker-7-dark-64.webp → ${logo.status}`);
  const logoBytes = await logo.arrayBuffer();
  assert(
    logoBytes.byteLength > 100,
    `logo body too small: ${logoBytes.byteLength}`,
  );
  const ct = logo.headers.get("content-type") || "";
  assert(
    ct.includes("image") || logoBytes.byteLength > 500,
    `logo content-type unexpected: ${ct}`,
  );
  console.log(
    `  ok /images/astrohacker-7-dark-64.webp (${logoBytes.byteLength} bytes, ${ct})`,
  );

  // Initial assets and the lazy SpaceRain runtime still work under wrong cwd.
  const assetRefs = [...html.matchAll(/["'](\/assets\/[^"']+)["']/g)].map(
    (m) => m[1],
  );
  assert(assetRefs.length > 0, "no /assets/ refs in HTML");
  console.log("probe: asset refs", assetRefs.slice(0, 12));

  const runtimeFiles = fs
    .readdirSync(path.join(pkgRoot, "build/client/assets"))
    .filter((name) => /^runtime-[^.]+\.js$/.test(name));
  assert(
    runtimeFiles.length === 1,
    `expected one SpaceRain runtime chunk, got ${runtimeFiles}`,
  );
  const obsoleteAmbientId = ["glyph", "rain"].join("-");
  assert(
    !html.includes(obsoleteAmbientId),
    "HTML retains obsolete ambient identifier",
  );

  for (const p of [...assetRefs, `/assets/${runtimeFiles[0]}`]) {
    const r = await fetch(`http://127.0.0.1:${port}${p}`);
    assert(r.ok, `${p} → ${r.status}`);
    const body = await r.text();
    assert(body.length > 100, `${p} body too small`);
    assert(!body.includes("runServerMode"), `${p} looks like server bundle`);
    console.log(`  ok ${p} (${body.length} bytes)`);
  }

  socket.destroy();
  child.kill("SIGTERM");
  await Promise.race([new Promise((r) => child.on("close", r)), sleep(3000)]);
  console.log("compiled-server-probe: PASS");
  process.exit(0);
} catch (e) {
  console.error("compiled-server-probe: FAIL", e);
  cleanup();
  process.exit(1);
}
