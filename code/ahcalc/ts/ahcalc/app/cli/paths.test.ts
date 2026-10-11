import * as assert from "node:assert/strict";
import { describe, it } from "bun:test";

import { resolveControlSocketPath } from "./paths.ts";

describe("resolveControlSocketPath", () => {
  it("uses AHCALC_SOCK_PATH override", () => {
    const r = resolveControlSocketPath({
      AHCALC_SOCK_PATH: "/tmp/t/ahcalc.sock",
    });
    assert.equal(r.socket, "/tmp/t/ahcalc.sock");
    assert.equal(r.dir, "/tmp/t");
  });

  it("uses short /tmp/ahc-uid by default (macOS path length)", () => {
    const r = resolveControlSocketPath({
      XDG_RUNTIME_DIR: "/run/user/501/very/long/path/that/would/break/sun_path",
    });
    assert.ok(r.dir.startsWith("/tmp/ahc-") || r.dir.includes("ahc-"));
    assert.ok(r.socket.endsWith("/ahcalc.sock"));
    assert.ok(
      r.socket.length < 100,
      `path too long for macOS UDS: ${String(r.socket.length)}`,
    );
  });

  it("respects AHCALC_RUNTIME_DIR", () => {
    const r = resolveControlSocketPath({ AHCALC_RUNTIME_DIR: "/tmp/ahc-test" });
    assert.equal(r.dir, "/tmp/ahc-test");
    assert.equal(r.socket, "/tmp/ahc-test/ahcalc.sock");
  });
});
