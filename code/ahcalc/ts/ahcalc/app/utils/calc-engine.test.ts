import { describe, expect, test } from "bun:test";

import { ERROR_DISPLAY, runKeys } from "./calc-engine";

describe("calc-engine oracle", () => {
  test("1 + 2 =", () => {
    expect(runKeys(["1", "+", "2", "="]).display).toBe("3");
  });

  test("5 − 3 =", () => {
    expect(runKeys(["5", "-", "3", "="]).display).toBe("2");
  });

  test("4 × 5 =", () => {
    expect(runKeys(["4", "*", "5", "="]).display).toBe("20");
  });

  test("8 ÷ 2 =", () => {
    expect(runKeys(["8", "/", "2", "="]).display).toBe("4");
  });

  test("1 ÷ 0 = Error", () => {
    expect(runKeys(["1", "/", "0", "="]).display).toBe(ERROR_DISPLAY);
  });

  test("9 √", () => {
    expect(runKeys(["9", "√"]).display).toBe("3");
  });

  test("4 ±", () => {
    expect(runKeys(["4", "±"]).display).toBe("-4");
  });

  test("50 %", () => {
    expect(runKeys(["5", "0", "%"]).display).toBe("0.5");
  });

  test("5 x²", () => {
    expect(runKeys(["5", "x²"]).display).toBe("25");
  });

  test("√ of negative is Error", () => {
    expect(runKeys(["1", "±", "√"]).display).toBe(ERROR_DISPLAY);
  });

  test("1 + 2 + 3 = immediate chain", () => {
    expect(runKeys(["1", "+", "2", "+", "3", "="]).display).toBe("6");
  });

  test("1.5 + 2 =", () => {
    expect(runKeys(["1", ".", "5", "+", "2", "="]).display).toBe("3.5");
  });

  test("AC clears", () => {
    expect(runKeys(["1", "2", "3", "AC"]).display).toBe("0");
  });

  test("Error then digit recovers", () => {
    expect(runKeys(["1", "/", "0", "=", "7"]).display).toBe("7");
  });

  test("Error then AC recovers", () => {
    expect(runKeys(["1", "/", "0", "=", "AC"]).display).toBe("0");
  });

  test("backspace removes digit", () => {
    expect(runKeys(["1", "2", "3", "Backspace"]).display).toBe("12");
  });
});
