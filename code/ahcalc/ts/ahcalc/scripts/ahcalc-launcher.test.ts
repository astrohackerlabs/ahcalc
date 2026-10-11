/**
 * Structural gate: package entry helper must not default AHCALC_SERVER_BIN to
 * the deleted ahcalc-server sibling (Issue 26071923279947 Exp 1).
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const launcher = path.resolve(import.meta.dir, "ahcalc");

describe("scripts/ahcalc launcher (unified binary)", () => {
  test("does not assign AHCALC_SERVER_BIN or name ahcalc-server", () => {
    const text = fs.readFileSync(launcher, "utf8");
    expect(text).toContain("dist/ahcalc");
    expect(text).not.toMatch(/AHCALC_SERVER_BIN=/);
    expect(text).not.toContain("ahcalc-server");
  });
});
