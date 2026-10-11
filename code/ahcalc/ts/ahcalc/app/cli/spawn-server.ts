/**
 * Spawn the dedicated ahcalc server process (same binary + --server, or bun fallback).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { resolvePackageRoot } from "./paths.ts";

/** True when this process is the compiled product binary (not `bun script.ts`). */
export function isCompiledAhcalcBinary(
  execPath: string = process.execPath,
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.AHCALC_COMPILED === "1") return true;
  const base = path.basename(execPath);
  if (base === "ahcalc") return true;
  // Bun script: argv[1] is a .ts/.js entry
  const script = argv[1];
  if (script && /\.(ts|tsx|js|mjs|cjs)$/.test(script)) return false;
  // Compiled binaries often have no script path or point at themselves
  if (!script || script === execPath) return true;
  return false;
}

/**
 * Resolve argv for the dedicated server process.
 * Pass path: same product binary + `--server` (not a sibling `ahcalc-server`).
 */
export function resolveServerBinary(
  env: NodeJS.ProcessEnv = process.env,
  opts: {
    execPath?: string;
    argv?: string[];
  } = {},
): string[] {
  if (env.AHCALC_SERVER_BIN) {
    // Harness/debug override: may be a full command path or "path --server"
    const raw = env.AHCALC_SERVER_BIN.trim();
    if (raw.includes(" ")) {
      return raw.split(/\s+/).filter(Boolean);
    }
    // If override is the unified product binary, force server role flag
    if (path.basename(raw) === "ahcalc") {
      return [raw, "--server"];
    }
    return [raw];
  }

  const execPath = opts.execPath ?? process.execPath;
  const argv = opts.argv ?? process.argv;

  if (isCompiledAhcalcBinary(execPath, argv, env)) {
    return [execPath, "--server"];
  }

  // Bun source: re-invoke this package's unified cli.ts with --server
  const argv1 = argv[1];
  if (argv1) {
    const pkgRoot = path.resolve(path.dirname(argv1));
    // cli.ts lives at package root
    if (fs.existsSync(path.join(pkgRoot, "cli.ts"))) {
      return [execPath, path.join(pkgRoot, "cli.ts"), "--server"];
    }
    // scripts/ahcalc → parent is package
    const parent = path.resolve(pkgRoot, "..");
    if (fs.existsSync(path.join(parent, "cli.ts"))) {
      return [execPath, path.join(parent, "cli.ts"), "--server"];
    }
  }

  // Last resort: package-relative from this module (app/cli → package root)
  const guess = path.resolve(import.meta.dir, "../../cli.ts");
  if (fs.existsSync(guess)) {
    return [execPath, guess, "--server"];
  }

  throw new Error(
    "cannot locate ahcalc server entry (unified binary or cli.ts)",
  );
}

export function resolvePkgRootForSpawn(
  env: NodeJS.ProcessEnv = process.env,
  execPath: string = process.execPath,
): string {
  try {
    return resolvePackageRoot(env, execPath);
  } catch {
    /* fall through */
  }
  const cwd = process.cwd();
  const nested = path.join(cwd, "code", "termsurf", "ts", "ahcalc");
  if (fs.existsSync(path.join(nested, "build", "client", "index.html"))) {
    return nested;
  }
  throw new Error(
    "cannot resolve AHCALC_PKG_ROOT (need package with build/client after build:ahcalc)",
  );
}

export function spawnServerBinary(
  env: NodeJS.ProcessEnv = process.env,
  opts: { replace?: boolean } = {},
): void {
  const cmd = resolveServerBinary(env);
  const pkgRoot = resolvePkgRootForSpawn(env);
  if (!fs.existsSync(path.join(pkgRoot, "public", "styles", "ahcalc.css"))) {
    console.error(
      `ahcalc: warning AHCALC_PKG_ROOT=${pkgRoot} missing public/styles/ahcalc.css`,
    );
  }

  const childEnv = {
    ...process.env,
    ...env,
    AHCALC_ROLE: "server",
    AHCALC_PKG_ROOT: pkgRoot,
  };

  if (opts.replace) {
    // Rare: replace current process with server role of same/other binary
    const proc = Bun.spawn(cmd, {
      env: childEnv,
      cwd: process.cwd(),
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });
    proc.exited.then(
      (code) => process.exit(code),
      (error: unknown) => {
        console.error(
          "ahcalc: failed to observe replacement server exit",
          error,
        );
        process.exit(1);
      },
    );
    return;
  }

  const debug = env.AHCALC_DEBUG === "1" || env.AHCALC_DEBUG === "true";
  // Detached server: inherit stderr when debugging so spawn failures are visible.
  // Always set cwd to package root so relative asset resolution is stable.
  Bun.spawn(cmd, {
    env: childEnv,
    cwd: pkgRoot,
    stdout: debug ? "inherit" : "ignore",
    stderr: debug ? "inherit" : "ignore",
    stdin: "ignore",
  });
}
