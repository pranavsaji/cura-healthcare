import type {
  AuditEvent,
  ClientMessage,
  Note,
  NoteTemplate,
  ServerMessage,
  Session,
} from "@cura/shared";

/**
 * Typed, end-to-end REST + WS client. Every request is credentialed
 * (`credentials: "include"`) so the HttpOnly `cura_session` cookie flows to the
 * API; a `401` surfaces as {@link ApiError} so the router can bounce to /login.
 * Types come from `@cura/shared` — one source of truth across the wire.
 */
const API = (import.meta.env?.VITE_API_URL as string | undefined) ?? "http://localhost:4100";
const WS = API.replace(/^http/, "ws");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  // Only advertise a JSON content-type when we actually send a body — otherwise
  // Fastify rejects the empty body of a bodyless POST with a 400/500.
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${API}${path}`, { credentials: "include", ...init, headers });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    const message = (body as { message?: string })?.message ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface Identity {
  orgId: string;
  userId: string;
  role: string;
  permissions: string[];
}

export const api = {
  // auth
  me: () => req<Identity>("/auth/me"),
  devLogin: (role: string) =>
    req<{ ok: boolean; role: string }>("/auth/dev-login", { method: "POST", body: JSON.stringify({ role }) }),
  logout: () => req<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  // templates + sessions
  templates: () => req<NoteTemplate[]>("/templates"),
  sessions: () => req<Session[]>("/sessions"),
  getSession: (id: string) => req<Session>(`/sessions/${id}`),
  createSession: (body: { clientLabel: string; modality?: string; templateId?: string; source?: string }) =>
    req<Session>("/sessions", { method: "POST", body: JSON.stringify(body) }),
  consent: (id: string) => req<Session>(`/sessions/${id}/consent`, { method: "POST" }),
  generate: (id: string) => req<Note>(`/sessions/${id}/generate`, { method: "POST" }),

  // notes
  getNote: (id: string) => req<Note>(`/notes/${id}`),
  editSection: (id: string, sectionKey: string, content: string) =>
    req<Note>(`/notes/${id}/section`, { method: "PATCH", body: JSON.stringify({ sectionKey, content }) }),
  sign: (id: string) => req<Note>(`/notes/${id}/sign`, { method: "POST" }),
  sync: (id: string) => req<{ note: Note; formatted: string }>(`/notes/${id}/sync`, { method: "POST" }),

  // observability / audit (Phase 14)
  audit: (params?: { action?: string; actor?: string; resource?: string; phiTouched?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.action) q.set("action", params.action);
    if (params?.actor) q.set("actor", params.actor);
    if (params?.resource) q.set("resource", params.resource);
    if (params?.phiTouched !== undefined) q.set("phiTouched", String(params.phiTouched));
    const qs = q.toString();
    return req<{ events: AuditEvent[]; total: number }>(`/audit${qs ? `?${qs}` : ""}`);
  },
  auditVerify: () => req<{ ok: boolean; length: number; brokenAt?: number }>("/audit/verify"),
  run: (resource: string) => req<{ resource: string; steps: AuditEvent[] }>(`/runs/${encodeURIComponent(resource)}`),
};

/** Thin WebSocket wrapper for the realtime capture channel. */
export function connectRealtime(handlers: {
  onMessage: (msg: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
}) {
  const ws = new WebSocket(`${WS}/ws`);
  ws.addEventListener("open", () => handlers.onOpen?.());
  ws.addEventListener("close", () => handlers.onClose?.());
  ws.addEventListener("message", (ev) => {
    try {
      handlers.onMessage(JSON.parse(ev.data as string) as ServerMessage);
    } catch {
      /* ignore malformed frames */
    }
  });
  const send = (msg: ClientMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
  return { ws, send };
}
