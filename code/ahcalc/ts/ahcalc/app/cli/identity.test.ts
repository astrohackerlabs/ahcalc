import * as assert from "node:assert/strict";
import { describe, it } from "bun:test";

import {
  buildCalcUrl,
  mintClientIdentity,
  parseIdentityFromUrl,
  timingSafeEqualStr,
} from "./identity.ts";

describe("identity", () => {
  it("mints unique id+token pairs", () => {
    const a = mintClientIdentity();
    const b = mintClientIdentity();
    assert.notEqual(a.clientId, b.clientId);
    assert.notEqual(a.token, b.token);
  });

  it("round-trips identity in calc URL", () => {
    const id = mintClientIdentity();
    const url = buildCalcUrl(3456, id);
    assert.ok(url.startsWith("http://127.0.0.1:3456/"));
    const parsed = parseIdentityFromUrl(url);
    assert.deepEqual(parsed, id);
  });

  it("timingSafeEqualStr", () => {
    assert.equal(timingSafeEqualStr("abc", "abc"), true);
    assert.equal(timingSafeEqualStr("abc", "abd"), false);
    assert.equal(timingSafeEqualStr("ab", "abc"), false);
  });
});
