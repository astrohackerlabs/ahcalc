import { describe, expect, test } from "bun:test";

import {
  detectIdentityFlag,
  formatVersionLine,
  HELP_FIRST_LINE,
  helpOutput,
  resolveProductVersion,
  tryHandleIdentity,
  versionOutput,
} from "./product-identity.ts";

describe("resolveProductVersion / formatVersionLine", () => {
  test("embedded version is used", () => {
    expect(resolveProductVersion("1.2.3", "0.0.1")).toBe("1.2.3");
  });

  test("package fallback when embed is empty", () => {
    expect(resolveProductVersion("", "0.0.1")).toBe("0.0.1");
  });

  test("ASTROHACKER_VERSION does not override the embedded version", () => {
    const saved = process.env.ASTROHACKER_VERSION;
    process.env.ASTROHACKER_VERSION = "9.9.9";
    try {
      expect(resolveProductVersion("1.2.3")).toBe("1.2.3");
    } finally {
      if (saved === undefined) delete process.env.ASTROHACKER_VERSION;
      else process.env.ASTROHACKER_VERSION = saved;
    }
  });

  test("formatVersionLine is Astrohacker Calculator <version>", () => {
    expect(formatVersionLine("9.9.9")).toBe("Astrohacker Calculator 9.9.9");
  });
});

describe("detectIdentityFlag", () => {
  test("detects --version and -V", () => {
    expect(detectIdentityFlag(["ahcalc", "--version"])).toBe("version");
    expect(detectIdentityFlag(["ahcalc", "-V"])).toBe("version");
  });

  test("detects --help and -h", () => {
    expect(detectIdentityFlag(["ahcalc", "--help"])).toBe("help");
    expect(detectIdentityFlag(["ahcalc", "-h"])).toBe("help");
  });

  test("null when no identity flags", () => {
    expect(detectIdentityFlag(["ahcalc"])).toBe(null);
    expect(detectIdentityFlag(["ahcalc", "--server"])).toBe(null);
  });

  test("identity before other args still wins", () => {
    expect(detectIdentityFlag(["ahcalc", "--version", "--server"])).toBe(
      "version",
    );
  });
});

describe("tryHandleIdentity (shipped dispatch)", () => {
  test("writes version first line and returns true", () => {
    const chunks: string[] = [];
    const handled = tryHandleIdentity(["ahcalc", "--version"], (s) =>
      chunks.push(s),
    );
    expect(handled).toBe(true);
    const text = chunks.join("");
    expect(text.split("\n")[0]).toBe(
      formatVersionLine(resolveProductVersion()),
    );
    expect(versionOutput(resolveProductVersion())).toBe(text);
  });

  test("writes help first line starting with Astrohacker Calculator", () => {
    const chunks: string[] = [];
    const handled = tryHandleIdentity(["ahcalc", "--help"], (s) =>
      chunks.push(s),
    );
    expect(handled).toBe(true);
    const text = chunks.join("");
    expect(text.split("\n")[0]).toBe(HELP_FIRST_LINE);
    expect(text.startsWith("Astrohacker Calculator")).toBe(true);
    expect(helpOutput(resolveProductVersion())).toBe(text);
  });

  test("returns false when not identity (does not write)", () => {
    const chunks: string[] = [];
    expect(tryHandleIdentity(["ahcalc"], (s) => chunks.push(s))).toBe(false);
    expect(chunks).toEqual([]);
  });
});
