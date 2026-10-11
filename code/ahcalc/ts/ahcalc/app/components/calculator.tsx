/**
 * React calculator keypad — pure engine driven (calc-engine.ts).
 */
import { useEffect, useState } from "react";

import { Button } from "@astrohacker/ui/button";
import {
  createCalcState,
  inputFromKey,
  reduceCalc,
  type CalcState,
} from "~/utils/calc-engine";

interface KeyDef {
  id: string;
  label: string;
  key: string;
  tone?: "op" | "fn" | "eq";
}

const KEYS: KeyDef[] = [
  { id: "ac", label: "AC", key: "AC", tone: "fn" },
  { id: "bs", label: "⌫", key: "Backspace", tone: "fn" },
  { id: "pct", label: "%", key: "%", tone: "fn" },
  { id: "div", label: "÷", key: "/", tone: "op" },
  { id: "7", label: "7", key: "7" },
  { id: "8", label: "8", key: "8" },
  { id: "9", label: "9", key: "9" },
  { id: "mul", label: "×", key: "*", tone: "op" },
  { id: "4", label: "4", key: "4" },
  { id: "5", label: "5", key: "5" },
  { id: "6", label: "6", key: "6" },
  { id: "sub", label: "−", key: "-", tone: "op" },
  { id: "1", label: "1", key: "1" },
  { id: "2", label: "2", key: "2" },
  { id: "3", label: "3", key: "3" },
  { id: "add", label: "+", key: "+", tone: "op" },
  { id: "neg", label: "±", key: "±", tone: "fn" },
  { id: "0", label: "0", key: "0" },
  { id: "dot", label: ".", key: "." },
  { id: "eq", label: "=", key: "=", tone: "eq" },
  { id: "sqrt", label: "√", key: "√", tone: "fn" },
  { id: "sq", label: "x²", key: "x²", tone: "fn" },
];

/** Tone styling is CSS (ahcalc-key--*); Button uses outline from @astrohacker/ui. */
function toneClass(tone?: KeyDef["tone"]): string {
  if (tone === "op") return "ahcalc-key--op";
  if (tone === "fn") return "ahcalc-key--fn";
  if (tone === "eq") return "ahcalc-key--eq";
  return "";
}

export function Calculator(): React.JSX.Element {
  const [state, setState] = useState<CalcState>(() => createCalcState());

  function applyKey(key: string): void {
    const input = inputFromKey(key);
    if (!input) return;
    setState((s) => reduceCalc(s, input));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (
        e.defaultPrevented ||
        (e.target instanceof Element &&
          e.target.closest("[data-motion-menu], [data-motion-menu-panel]"))
      )
        return;
      let k = e.key;
      if (k === "Enter") k = "=";
      if (k === "Escape") k = "AC";
      if (inputFromKey(k)) {
        e.preventDefault();
        applyKey(k);
      }
    };
    window.addEventListener("keydown", onKey);
    return (): void => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div data-testid="ahcalc-keypad" className="ahcalc-keypad">
      <div
        data-testid="ahcalc-display"
        aria-live="polite"
        className="ahcalc-display"
      >
        {state.display}
      </div>
      {KEYS.map((k) => (
        <Button
          key={k.id}
          data-testid={`ahcalc-key-${k.id}`}
          data-key={k.key}
          variant="outline"
          className={["ahcalc-key", toneClass(k.tone)]
            .filter(Boolean)
            .join(" ")}
          onClick={() => {
            applyKey(k.key);
          }}
        >
          {k.label}
        </Button>
      ))}
    </div>
  );
}
