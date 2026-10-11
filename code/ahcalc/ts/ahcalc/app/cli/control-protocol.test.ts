import { expect, test } from "bun:test";
import { encodeLine, parseLine, type ControlMessage } from "./control-protocol";

test("all control messages retain their wire fields", () => {
  const messages: ControlMessage[] = [
    { type: "registered", port: 3460, clientId: "c", token: "t" },
    { type: "exit", reason: "ui-x" },
    { type: "error", message: "unavailable" },
    { type: "ping" },
  ];
  for (const message of messages) {
    expect(parseLine(encodeLine(message))).toEqual(message);
  }
});

test("malformed control messages do not become trusted protocol values", () => {
  for (const input of [
    "",
    "{",
    "null",
    "[]",
    "1",
    '"text"',
    '{"type":"unknown"}',
    '{"type":"registered"}',
    '{"type":"registered","port":"3460","clientId":"c","token":"t"}',
    '{"type":"registered","port":3460,"clientId":1,"token":"t"}',
    '{"type":"registered","port":3460,"clientId":"c","token":null}',
    '{"type":"exit","reason":false}',
    '{"type":"error","message":[]}',
  ])
    expect(parseLine(input)).toBeNull();
  expect(parseLine('{"type":"ping","extension":1}')).toEqual({ type: "ping" });
});
