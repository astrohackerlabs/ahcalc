import { describe, expect, test } from "bun:test";
import * as path from "node:path";

import { isCompiledAhcalcBinary, resolveServerBinary } from "./spawn-server.ts";

describe("resolveServerBinary (unified binary)", () => {
  test("compiled ahcalc prefers self + --server, not ahcalc-server", () => {
    const exec = "/opt/ahcalc/dist/ahcalc";
    const cmd = resolveServerBinary(
      { AHCALC_COMPILED: "1" },
      { execPath: exec, argv: [exec] },
    );
    expect(cmd).toEqual([exec, "--server"]);
    expect(cmd.some((c) => c.includes("ahcalc-server"))).toBe(false);
  });

  test("basename ahcalc is treated as compiled even without env", () => {
    const exec = path.join("/Applications", "ahcalc");
    expect(isCompiledAhcalcBinary(exec, [exec], {})).toBe(true);
    const cmd = resolveServerBinary({}, { execPath: exec, argv: [exec] });
    expect(cmd).toEqual([exec, "--server"]);
  });

  test("AHCALC_SERVER_BIN override wins for harness", () => {
    const cmd = resolveServerBinary(
      { AHCALC_SERVER_BIN: "/tmp/custom-server" },
      {
        execPath: "/opt/ahcalc/dist/ahcalc",
        argv: ["/opt/ahcalc/dist/ahcalc"],
      },
    );
    expect(cmd).toEqual(["/tmp/custom-server"]);
  });

  test("AHCALC_SERVER_BIN pointing at ahcalc adds --server", () => {
    const bin = "/pkg/dist/ahcalc";
    const cmd = resolveServerBinary({ AHCALC_SERVER_BIN: bin }, {});
    expect(cmd).toEqual([bin, "--server"]);
  });

  test("bun cli.ts uses bun + cli.ts + --server", () => {
    const bun = "/usr/local/bin/bun";
    const cli = path.resolve(import.meta.dir, "../../cli.ts");
    const cmd = resolveServerBinary({}, { execPath: bun, argv: [bun, cli] });
    expect(cmd[0]).toBe(bun);
    expect(cmd[1]).toBe(cli);
    expect(cmd[2]).toBe("--server");
    expect(cmd.some((c) => c.includes("ahcalc-server"))).toBe(false);
  });
});
