import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve UDS path for ahcalc control plane (owner-only dir).
 * Keep the absolute path short: macOS sun_path is ~104 bytes.
 */
export function resolveControlSocketPath(
  env: NodeJS.ProcessEnv = process.env,
): {
  dir: string;
  socket: string;
} {
  // Test/harness override (caller must keep path short on macOS)
  if (env.AHCALC_SOCK_PATH) {
    const socket = env.AHCALC_SOCK_PATH;
    return { dir: path.dirname(socket), socket };
  }

  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  // Prefer short /tmp/ahc-<uid> over deep XDG paths (macOS sockaddr_un limit)
  let dir: string;
  if (env.AHCALC_RUNTIME_DIR) {
    dir = env.AHCALC_RUNTIME_DIR;
  } else {
    const tmp = "/tmp";
    dir = path.join(tmp, `ahc-${String(uid)}`);
  }

  return { dir, socket: path.join(dir, "ahcalc.sock") };
}

/** Ensure runtime directory exists with owner-only permissions (0700). */
export function ensureRuntimeDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    /* best-effort on platforms that ignore mode */
  }
}

/** True if path looks like a dead socket we may unlink (connect refused / not a live peer). */
export function isStaleSocketError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "ECONNREFUSED" || code === "ENOENT" || code === "ENOTDIR";
}

/**
 * Package root for SPA assets (`build/client`, `public/`).
 * Compiled binary must not trust import.meta ($bunfs) — use execPath / env.
 */
export function resolvePackageRoot(
  env: NodeJS.ProcessEnv = process.env,
  execPath: string = process.execPath,
): string {
  const fromEnv = env.AHCALC_PKG_ROOT?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (fs.existsSync(resolved)) return resolved;
  }

  // dist/ahcalc → package root is parent of dist/
  const execDir = path.dirname(path.resolve(execPath));
  if (path.basename(execDir) === "dist") {
    const candidate = path.dirname(execDir);
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }
  // binary named ahcalc sitting in package root
  if (path.basename(execPath) === "ahcalc") {
    if (fs.existsSync(path.join(execDir, "package.json"))) {
      return execDir;
    }
  }

  // Source / bun run: app/cli → package root
  try {
    const fromMeta = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    if (fs.existsSync(path.join(fromMeta, "package.json"))) {
      return fromMeta;
    }
  } catch {
    /* compiled may lack usable import.meta */
  }

  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json"))) {
    // monorepo root: prefer code/ahcalc/ts/ahcalc if present
    const nested = path.join(cwd, "code", "termsurf", "ts", "ahcalc");
    if (fs.existsSync(path.join(nested, "package.json"))) return nested;
    return cwd;
  }

  throw new Error(
    "cannot resolve AHCALC_PKG_ROOT (set env or run dist/ahcalc from package tree)",
  );
}
