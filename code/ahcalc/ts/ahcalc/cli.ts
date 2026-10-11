/**
 * Unified ahcalc entry (compiled to dist/ahcalc).
 * Default: client (TermSurf + UDS). Server role: --server or AHCALC_ROLE=server
 * runs dedicated HTTP+UDS in this process (same binary, separate process via spawn).
 *
 * Identity (--version / --help) is handled first so release gates never hang on TermSurf.
 */
import { tryHandleIdentity } from "./app/cli/product-identity.ts";
import { startClient, waitForExit } from "./app/cli/client-runtime.ts";
import { parseClientArgs } from "./app/cli/parse-args.ts";
import { runServerMode } from "./app/cli/server-runtime.ts";

function isServerRole(argv: string[], env: NodeJS.ProcessEnv): boolean {
  return argv.includes("--server") || env.AHCALC_ROLE === "server";
}

async function main(): Promise<void> {
  if (tryHandleIdentity(process.argv)) {
    process.exit(0);
  }

  if (isServerRole(process.argv, process.env)) {
    try {
      await runServerMode(process.env);
      // Keep the process alive while HTTP + UDS serve clients.
      await new Promise(() => {
        // Server-owned sockets govern lifetime; this promise never settles.
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(msg);
      process.exit(1);
    }
    return;
  }

  const parsed = parseClientArgs(process.argv, import.meta.path);
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exit(1);
  }

  try {
    const handles = await startClient(process.env, {
      browser: parsed.options.browser,
      profile: parsed.options.profile,
    });
    const reason = await waitForExit(handles);
    if (process.env.AHCALC_VERBOSE === "1") {
      console.error(`ahcalc client exit: ${reason}`);
    }
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exit(1);
  }
}

void main();
