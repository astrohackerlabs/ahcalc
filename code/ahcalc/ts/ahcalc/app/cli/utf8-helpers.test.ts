import { describe, expect, test } from "bun:test";
import { WebBuf } from "@webbuf/webbuf";
import { peekSetOverlayUrl } from "./termsurf-encode.ts";
import { chunkToWebBuf } from "./tty-esc.ts";
import { Socket } from "node:net";
import { PassThrough } from "node:stream";
import { waitForExit, type ClientHandles } from "./client-runtime.ts";

const vectors = [
  { name: "ASCII", hex: "616263", text: "abc" },
  { name: "multibyte", hex: "cf80f09f8c8c", text: "π🌌" },
  { name: "malformed", hex: "61ff62", text: "a\ufffdb" },
  { name: "truncated", hex: "e282", text: "\ufffd" },
  { name: "BOM", hex: "efbbbf61", text: "a" },
  { name: "empty", hex: "", text: "" },
];

describe("domain UTF-8 decoding", () => {
  for (const { name, hex, text } of vectors) {
    test(name + " overlay text from an offset frame", () => {
      const bytes = Buffer.from(hex, "hex");
      // Native, literal protobuf field 19 containing string field 6.
      const payload = Uint8Array.from([
        0x9a,
        0x01,
        bytes.length + 2,
        0x32,
        bytes.length,
        ...bytes,
      ]);
      const backing = new Uint8Array(payload.length + 6);
      backing[0] = 0x99;
      backing[backing.length - 1] = 0x88;
      new DataView(backing.buffer).setUint32(1, payload.length, true);
      backing.set(payload, 5);
      const before = backing.slice();
      const frame = WebBuf.view(backing.subarray(1, backing.length - 1));
      expect(peekSetOverlayUrl(frame)).toBe(text);
      expect(backing).toEqual(before);
    });

    test(name + " selected native chunk", () => {
      const backing = Buffer.from("99" + hex + "88", "hex");
      const selected = backing.subarray(1, backing.length - 1);
      const domain = chunkToWebBuf(selected);
      expect(domain.toUtf8()).toBe(text);
      selected.fill(0);
      expect(domain.toUtf8()).toBe(text);
      expect(backing[0]).toBe(0x99);
      expect(backing[backing.length - 1]).toBe(0x88);
    });
  }
  test("keeps string input and per-chunk replacement behavior", () => {
    expect(chunkToWebBuf("π🌌").toUtf8()).toBe("π🌌");
    const first = chunkToWebBuf(Buffer.from([0xe2, 0x82])).toUtf8();
    const second = chunkToWebBuf(Buffer.from([0xac])).toUtf8();
    expect(first + second).toBe("\ufffd\ufffd");
  });
});

describe("actual client control-line decoding", () => {
  for (const mode of ["string", "offset bytes", "split UTF-8"] as const) {
    test(mode, async () => {
      const control = new Socket();
      const stdin = new PassThrough();
      let closed = 0;
      const handles: ClientHandles = {
        identity: { clientId: "test-client", token: "test-token" },
        port: 0,
        termsurf: null,
        control,
        close: () => {
          closed++;
          control.destroy();
        },
      };
      const signals = [
        process.listenerCount("SIGINT"),
        process.listenerCount("SIGTERM"),
      ];
      const waiting = waitForExit(handles, { stdin, enableTtyRaw: false });
      const timer = setTimeout(() => control.emit("close"), 1000);
      try {
        let expected = "π🌌";
        if (mode === "string") {
          control.emit(
            "data",
            JSON.stringify({ type: "exit", reason: expected }) + "\n",
          );
        } else if (mode === "offset bytes") {
          const line = Buffer.from(
            JSON.stringify({ type: "exit", reason: expected }) + "\n",
          );
          const storage = Buffer.concat([
            Buffer.from([0x99]),
            line,
            Buffer.from([0x88]),
          ]);
          const before = Buffer.from(storage);
          control.emit("data", storage.subarray(1, storage.length - 1));
          expect(storage).toEqual(before);
        } else {
          // Keep the existing per-chunk replacement behavior, not streaming UTF-8.
          expected = "\ufffd\ufffd";
          control.emit(
            "data",
            Buffer.concat([
              Buffer.from('{"type":"exit","reason":"'),
              Buffer.from([0xe2, 0x82]),
            ]),
          );
          control.emit(
            "data",
            Buffer.concat([Buffer.from([0xac]), Buffer.from('"}\n')]),
          );
        }
        expect(await waiting).toBe(expected);
        expect(closed).toBe(1);
        expect([
          process.listenerCount("SIGINT"),
          process.listenerCount("SIGTERM"),
        ]).toEqual(signals);
      } finally {
        clearTimeout(timer);
        control.emit("close");
        control.destroy();
        stdin.destroy();
        await waiting;
      }
    });
  }
});
