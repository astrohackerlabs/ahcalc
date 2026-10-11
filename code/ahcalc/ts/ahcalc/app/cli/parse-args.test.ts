import { describe, expect, test } from "bun:test";

import {
  isBunCompileVirtualEntry,
  overlayFromOptions,
  parseClientArgs,
} from "./parse-args.ts";
import { setOverlayDefaults } from "./termsurf-encode.ts";

/** Compiled-binary argv shape: exec + Bun virtual entry (+ user flags). */
const COMPILED_ARGV0 = "/opt/homebrew/bin/ahcalc";
const BUNFS_ENTRY = "/$bunfs/root/ahcalc";

describe("isBunCompileVirtualEntry", () => {
  test("matches Bun virtual entry forms", () => {
    expect(isBunCompileVirtualEntry("/$bunfs/root/ahcalc")).toBe(true);
    expect(isBunCompileVirtualEntry("/$bunfs/root/cli.ts")).toBe(true);
  });

  test("does not match ordinary user tokens", () => {
    expect(isBunCompileVirtualEntry("ahcalc")).toBe(false);
    expect(isBunCompileVirtualEntry("/usr/local/bin/ahcalc")).toBe(false);
    expect(isBunCompileVirtualEntry("--browser")).toBe(false);
    expect(isBunCompileVirtualEntry("some-positional")).toBe(false);
  });
});

describe("parseClientArgs", () => {
  test("only exact source argv[1] is skipped", () => {
    const entry = "/source with spaces/cli.ts";
    expect(parseClientArgs(["bun", entry, "--profile", "lab"], entry)).toEqual({
      ok: true,
      options: { browser: "", profile: "lab", server: false },
    });
    for (const args of [
      ["bun", "/other/cli.ts"],
      ["bun", entry, entry],
      ["bun", entry, "--bad"],
      ["bun", entry, "--browser"],
      ["ahcalc", "unrelated.ts"],
    ]) {
      expect(parseClientArgs(args, entry).ok).toBe(false);
    }
    expect(parseClientArgs(["bun", entry], entry).ok).toBe(true);
  });
  test("omission keeps empty browser and default profile", () => {
    const r = parseClientArgs(["ahcalc"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.browser).toBe("");
    expect(r.options.profile).toBe("default");
    expect(r.options.server).toBe(false);
  });

  test("skips Bun compile virtual entry (compiled bare launch)", () => {
    const r = parseClientArgs([COMPILED_ARGV0, BUNFS_ENTRY]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.browser).toBe("");
    expect(r.options.profile).toBe("default");
    expect(r.options.server).toBe(false);
  });

  test("parses flags after Bun virtual entry", () => {
    const r = parseClientArgs([
      COMPILED_ARGV0,
      BUNFS_ENTRY,
      "--browser",
      "webkit",
      "--profile",
      "work",
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.browser).toBe("webkit");
    expect(r.options.profile).toBe("work");
  });

  test("parses equals flags after Bun virtual entry", () => {
    const r = parseClientArgs([
      COMPILED_ARGV0,
      BUNFS_ENTRY,
      "--browser=chromium",
      "--profile=lab",
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.browser).toBe("chromium");
    expect(r.options.profile).toBe("lab");
  });

  test("parses short flags after Bun virtual entry", () => {
    const r = parseClientArgs([
      COMPILED_ARGV0,
      BUNFS_ENTRY,
      "-b",
      "chromium",
      "-p",
      "incognito",
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.browser).toBe("chromium");
    expect(r.options.profile).toBe("incognito");
  });

  test("still rejects unknown flags after Bun virtual entry", () => {
    const r = parseClientArgs([COMPILED_ARGV0, BUNFS_ENTRY, "--incognito"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("unknown option");
  });

  test("still rejects true user positionals after Bun virtual entry", () => {
    const r = parseClientArgs([COMPILED_ARGV0, BUNFS_ENTRY, "extra-arg"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("unexpected argument: extra-arg");
  });

  test("parses --browser and --profile", () => {
    const r = parseClientArgs([
      "ahcalc",
      "--browser",
      "webkit",
      "--profile",
      "work",
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.browser).toBe("webkit");
    expect(r.options.profile).toBe("work");
  });

  test("parses short -b and -p", () => {
    const r = parseClientArgs(["ahcalc", "-b", "chromium", "-p", "incognito"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.browser).toBe("chromium");
    expect(r.options.profile).toBe("incognito");
  });

  test("parses --browser=value form", () => {
    const r = parseClientArgs(["ahcalc", "--browser=webkit", "--profile=p1"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.browser).toBe("webkit");
    expect(r.options.profile).toBe("p1");
  });

  test("allows --server with browser flags", () => {
    const r = parseClientArgs(["ahcalc", "--server", "--browser", "webkit"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.server).toBe(true);
    expect(r.options.browser).toBe("webkit");
  });

  test("errors on missing --browser value", () => {
    const r = parseClientArgs(["ahcalc", "--browser"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("missing value");
  });

  test("errors on unknown flag", () => {
    const r = parseClientArgs(["ahcalc", "--incognito"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("unknown option");
  });

  test("errors on unexpected positional without bunfs", () => {
    const r = parseClientArgs(["ahcalc", "extra"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("unexpected argument: extra");
  });
});

describe("overlayFromOptions + setOverlayDefaults (real encode path)", () => {
  test("omit path keeps host defaults on SetOverlay fields", () => {
    const r = parseClientArgs(["ahcalc"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = overlayFromOptions(r.options);
    const f = setOverlayDefaults({
      paneId: "p",
      col: 0,
      row: 0,
      width: 80,
      height: 24,
      url: "http://127.0.0.1:1/",
      browser: o.browser,
      profile: o.profile,
    });
    expect(f.browser).toBe("");
    expect(f.profile).toBe("default");
  });

  test("flags appear on real SetOverlay fields", () => {
    const r = parseClientArgs([
      "ahcalc",
      "--browser",
      "webkit",
      "--profile",
      "lab",
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = overlayFromOptions(r.options);
    const f = setOverlayDefaults({
      paneId: "p",
      col: 0,
      row: 0,
      width: 80,
      height: 24,
      url: "http://127.0.0.1:1/",
      browser: o.browser,
      profile: o.profile,
    });
    expect(f.browser).toBe("webkit");
    expect(f.profile).toBe("lab");
  });
});
