/**
 * Product CLI identity for release wrappers (Homebrew non-ahterm contract).
 * Keep pure and free of TermSurf / UDS so --version/--help never hang.
 */
import { AHCALC_EMBEDDED_VERSION } from "./embedded-version.ts";

export const PRODUCT_NAME = "Astrohacker Calculator";

export const HELP_FIRST_LINE =
  "Astrohacker Calculator — scientific calculator for Astrohacker TermSurf panes";

/**
 * Resolve stamped product version: `AHCALC_EMBEDDED_VERSION` (written at
 * compile from package.json), else the package fallback. ahcalc is versioned
 * independently, so no environment variable overrides it.
 */
export function resolveProductVersion(
  embeddedVersion: string = AHCALC_EMBEDDED_VERSION,
  packageFallback = "0.0.1",
): string {
  const fromEmbed = embeddedVersion.trim();
  if (fromEmbed) return fromEmbed;
  return packageFallback;
}

/** First line of `--version` output. */
export function formatVersionLine(version: string): string {
  return `${PRODUCT_NAME} ${version}`;
}

export type IdentityKind = "version" | "help" | null;

/** Detect identity flags in argv (process.argv-style, includes argv0). */
export function detectIdentityFlag(argv: string[]): IdentityKind {
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--version" || a === "-V") return "version";
    if (a === "--help" || a === "-h") return "help";
  }
  return null;
}

export function versionOutput(version: string): string {
  return formatVersionLine(version) + "\n";
}

export function helpOutput(version: string): string {
  return (
    HELP_FIRST_LINE +
    "\n\n" +
    `Version: ${formatVersionLine(version)}\n` +
    "Usage:\n" +
    "  ahcalc                 Open calculator in current Terminal pane (requires TERMSURF_*)\n" +
    "  ahcalc --browser <engine>   Browser engine (chromium, webkit, …)\n" +
    "  ahcalc --profile <name>     Browser profile name (default: default)\n" +
    "  ahcalc -b <engine>          Short for --browser\n" +
    "  ahcalc -p <name>            Short for --profile\n" +
    "  ahcalc --server        Run dedicated HTTP+UDS server role (same binary)\n" +
    "  ahcalc --version       Print version\n" +
    "  ahcalc --help          Print this help\n"
  );
}

/**
 * If argv requests identity, write to stdout and return true (caller should exit 0).
 * Does not exit the process itself (testable).
 */
export function tryHandleIdentity(
  argv: string[],
  write: (s: string) => void = (s) => process.stdout.write(s),
): boolean {
  const kind = detectIdentityFlag(argv);
  if (!kind) return false;
  const version = resolveProductVersion();
  if (kind === "version") {
    write(versionOutput(version));
  } else {
    write(helpOutput(version));
  }
  return true;
}
