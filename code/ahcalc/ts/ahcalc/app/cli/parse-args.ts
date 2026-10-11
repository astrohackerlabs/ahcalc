/**
 * Pure client CLI argv parse for ahcalc.
 * Identity (--version/--help) is handled separately before this path.
 */

export interface ClientCliOptions {
  browser: string;
  profile: string;
  /** True when --server is present (caller may still use isServerRole). */
  server: boolean;
}

export type ParseArgsResult =
  | { ok: true; options: ClientCliOptions }
  | { ok: false; error: string };

const DEFAULT_BROWSER = "";
const DEFAULT_PROFILE = "default";

/**
 * Bun `build --compile` injects the virtual entry path into process.argv
 * (typically argv[1] as `/$bunfs/root/<outfile>`). Not a user argument.
 */
export function isBunCompileVirtualEntry(arg: string): boolean {
  return arg.startsWith("/$bunfs/") || arg.includes("$bunfs/");
}

/**
 * Parse process.argv-style args (includes argv0).
 * Supports: --browser / -b, --profile / -p, --server.
 * Values may be `--flag=value` or `--flag value`.
 * Skips Bun compiled-binary virtual entry paths (`/$bunfs/…`).
 */
export function parseClientArgs(
  argv: string[],
  sourceEntry?: string,
): ParseArgsResult {
  let browser: string | undefined;
  let profile: string | undefined;
  let server = false;

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (i === 1 && sourceEntry !== undefined && a === sourceEntry) continue;
    // Bun --compile synthetic entry — not a user positional
    if (isBunCompileVirtualEntry(a)) {
      continue;
    }
    if (a === "--server") {
      server = true;
      continue;
    }
    // Identity handled earlier; skip so they don't become unknown errors
    if (a === "--version" || a === "-V" || a === "--help" || a === "-h") {
      continue;
    }

    const eq = a.indexOf("=");
    if (eq > 0 && a.startsWith("-")) {
      const key = a.slice(0, eq);
      const val = a.slice(eq + 1);
      if (key === "--browser" || key === "-b") {
        if (!val) return { ok: false, error: "missing value for --browser" };
        browser = val;
        continue;
      }
      if (key === "--profile" || key === "-p") {
        if (!val) return { ok: false, error: "missing value for --profile" };
        profile = val;
        continue;
      }
    }

    if (a === "--browser" || a === "-b") {
      const val = argv[++i];
      // oxlint-disable-next-line eqeqeq -- nullish check; === null would miss undefined
      if (val == null || val.startsWith("-")) {
        return { ok: false, error: "missing value for --browser" };
      }
      browser = val;
      continue;
    }
    if (a === "--profile" || a === "-p") {
      const val = argv[++i];
      // oxlint-disable-next-line eqeqeq -- nullish check; === null would miss undefined
      if (val == null || val.startsWith("-")) {
        return { ok: false, error: "missing value for --profile" };
      }
      profile = val;
      continue;
    }

    if (a.startsWith("-")) {
      return { ok: false, error: `unknown option: ${a}` };
    }
    return { ok: false, error: `unexpected argument: ${a}` };
  }

  return {
    ok: true,
    options: {
      browser: browser ?? DEFAULT_BROWSER,
      profile: profile ?? DEFAULT_PROFILE,
      server,
    },
  };
}

/** Overlay fields for SetOverlay (omit-path defaults). */
export function overlayFromOptions(options: ClientCliOptions): {
  browser: string;
  profile: string;
} {
  return {
    browser: options.browser,
    profile: options.profile,
  };
}
