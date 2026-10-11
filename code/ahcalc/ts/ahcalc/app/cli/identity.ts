import { randomBytes } from "node:crypto";

export interface ClientIdentity {
  clientId: string;
  token: string;
}

export function mintClientIdentity(): ClientIdentity {
  return {
    clientId: randomBytes(8).toString("hex"),
    token: randomBytes(16).toString("hex"),
  };
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export function buildCalcUrl(port: number, identity: ClientIdentity): string {
  const u = new URL(`http://127.0.0.1:${String(port)}/`);
  u.searchParams.set("client", identity.clientId);
  u.searchParams.set("token", identity.token);
  return u.toString();
}

export function parseIdentityFromUrl(url: string): ClientIdentity | null {
  try {
    const u = new URL(url, "http://127.0.0.1");
    const clientId = u.searchParams.get("client");
    const token = u.searchParams.get("token");
    if (!clientId || !token) return null;
    return { clientId, token };
  } catch {
    return null;
  }
}
