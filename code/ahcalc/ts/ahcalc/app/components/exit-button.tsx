/**
 * Per-client exit (UI ×). Posts clientId+token from the page query string
 * so only this TermSurf client session is closed.
 */
import { useState } from "react";

/**
 * Close calculator (×) — posts to /__ahcalc/exit with client session from URL.
 */
export function ExitButton(): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function identity(): { clientId: string; token: string } {
    const u = new URL(window.location.href);
    return {
      clientId: u.searchParams.get("client") ?? "",
      token: u.searchParams.get("token") ?? "",
    };
  }

  async function onClose(): Promise<void> {
    if (busy) return;
    const { clientId, token } = identity();
    if (!clientId || !token) {
      setError("missing client session");
      return;
    }
    setBusy(true);
    try {
      await fetch("/__ahcalc/exit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, token }),
      });
    } catch {
      setError("exit failed");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      data-testid="ahcalc-exit"
      aria-label="Close calculator"
      title="Close"
      className="ahcalc-exit"
      disabled={busy}
      onClick={() => {
        void onClose();
      }}
    >
      ×{error ? <span className="ahcalc-exit-err">{error}</span> : null}
    </button>
  );
}
