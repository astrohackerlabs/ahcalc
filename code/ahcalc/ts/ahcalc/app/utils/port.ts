/* oxlint-disable typescript/no-non-null-assertion -- existing definite assignment after guards */
/** Pure port resolution for ahcalc server entry. */

export const DEFAULT_PORT = 3460;

export interface PortOk {
  ok: true;
  port: number;
}
export interface PortErr {
  ok: false;
  error: string;
}
export type PortResult = PortOk | PortErr;

export interface PortInputs {
  /** process.argv-style (includes node/bun and script path) */
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
}

function parsePortToken(raw: string, source: string): PortResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: `Invalid port from ${source}: empty` };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: `Invalid port from ${source}: not an integer` };
  }
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return {
      ok: false,
      error: `Invalid port from ${source}: out of range 1–65535`,
    };
  }
  return { ok: true, port: n };
}

/** Extract `--port <n>` or `--port=<n>` from argv. */
export function portFromArgv(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--port") {
      return argv[i + 1];
    }
    if (a.startsWith("--port=")) {
      return a.slice("--port=".length);
    }
  }
  return undefined;
}

/**
 * Precedence: CLI `--port` > `AHCALC_PORT` > `PORT` > default 3460.
 * Invalid values reject (do not fall through).
 */
export function resolvePort(inputs: PortInputs = {}): PortResult {
  const argv = inputs.argv ?? [];
  const env = inputs.env ?? {};

  const cli = portFromArgv(argv);
  if (cli !== undefined) {
    return parsePortToken(cli, "--port");
  }

  if (env.AHCALC_PORT !== undefined) {
    return parsePortToken(env.AHCALC_PORT, "AHCALC_PORT");
  }

  if (env.PORT !== undefined) {
    return parsePortToken(env.PORT, "PORT");
  }

  return { ok: true, port: DEFAULT_PORT };
}
