import * as assert from "node:assert/strict";
import { describe, it } from "bun:test";

import { DEFAULT_PORT, resolvePort } from "./port.ts";

describe("resolvePort", () => {
  it("defaults to 3460", () => {
    const r = resolvePort({ argv: ["bun", "server.ts"], env: {} });
    assert.deepEqual(r, { ok: true, port: DEFAULT_PORT });
  });

  it("uses PORT when alone", () => {
    const r = resolvePort({ argv: [], env: { PORT: "4000" } });
    assert.deepEqual(r, { ok: true, port: 4000 });
  });

  it("AHCALC_PORT wins over PORT", () => {
    const r = resolvePort({
      argv: [],
      env: { AHCALC_PORT: "4100", PORT: "4000" },
    });
    assert.deepEqual(r, { ok: true, port: 4100 });
  });

  it("--port wins over AHCALC_PORT and PORT", () => {
    const r = resolvePort({
      argv: ["bun", "server.ts", "--port", "4200"],
      env: { AHCALC_PORT: "4100", PORT: "4000" },
    });
    assert.deepEqual(r, { ok: true, port: 4200 });
  });

  it("accepts --port= form", () => {
    const r = resolvePort({ argv: ["--port=4300"], env: {} });
    assert.deepEqual(r, { ok: true, port: 4300 });
  });

  it("rejects non-integer --port", () => {
    const r = resolvePort({ argv: ["--port", "abc"], env: {} });
    assert.equal(r.ok, false);
  });

  it("rejects port 0", () => {
    const r = resolvePort({ argv: ["--port", "0"], env: {} });
    assert.equal(r.ok, false);
  });

  it("rejects port 65536", () => {
    const r = resolvePort({ argv: ["--port", "65536"], env: {} });
    assert.equal(r.ok, false);
  });

  it("rejects negative", () => {
    const r = resolvePort({ argv: ["--port", "-1"], env: {} });
    assert.equal(r.ok, false);
  });

  it("rejects invalid AHCALC_PORT", () => {
    const r = resolvePort({ argv: [], env: { AHCALC_PORT: "not-a-port" } });
    assert.equal(r.ok, false);
  });

  it("rejects empty AHCALC_PORT", () => {
    const r = resolvePort({ argv: [], env: { AHCALC_PORT: "" } });
    assert.equal(r.ok, false);
  });
});
