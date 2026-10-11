/** App-local UDS control protocol (JSON lines). Not TermSurf protobuf. */

export interface ServerHello {
  type: "registered";
  port: number;
  clientId: string;
  token: string;
}

export interface ServerExitPush {
  type: "exit";
  reason: string;
}

export interface ServerError {
  type: "error";
  message: string;
}

export interface ClientPing {
  type: "ping";
}

export type ControlMessage =
  | ServerHello
  | ServerExitPush
  | ServerError
  | ClientPing;

export function encodeLine(msg: ControlMessage): string {
  return JSON.stringify(msg) + "\n";
}

export function parseLine(line: string): ControlMessage | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const o: unknown = JSON.parse(t);
    if (typeof o !== "object" || o === null || !("type" in o)) return null;
    switch (o.type) {
      case "registered":
        if (
          !("port" in o) ||
          typeof o.port !== "number" ||
          !("clientId" in o) ||
          typeof o.clientId !== "string" ||
          !("token" in o) ||
          typeof o.token !== "string"
        )
          return null;
        return {
          type: o.type,
          port: o.port,
          clientId: o.clientId,
          token: o.token,
        };
      case "exit":
        return "reason" in o && typeof o.reason === "string"
          ? { type: o.type, reason: o.reason }
          : null;
      case "error":
        return "message" in o && typeof o.message === "string"
          ? { type: o.type, message: o.message }
          : null;
      case "ping":
        return { type: o.type };
      default:
        return null;
    }
  } catch {
    return null;
  }
}
