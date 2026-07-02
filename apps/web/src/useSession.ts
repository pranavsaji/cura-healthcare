import { useCallback, useRef, useState } from "react";
import type { Note, NoteSection, RiskFlag, TranscriptSegment } from "@cura/shared";
import { api, connectRealtime } from "./api.js";
import { DEMO_SESSION } from "./demoScript.js";

export type Phase = "idle" | "consent" | "recording" | "writing" | "ready";

export interface SessionState {
  phase: Phase;
  sessionId: string | null;
  clientLabel: string;
  partial: { text: string; speaker: string } | null;
  segments: TranscriptSegment[];
  sections: NoteSection[];
  risks: RiskFlag[];
  noteId: string | null;
  note: Note | null;
}

const initial: SessionState = {
  phase: "idle",
  sessionId: null,
  clientLabel: "",
  partial: null,
  segments: [],
  sections: [],
  risks: [],
  noteId: null,
  note: null,
};

export function useSession() {
  const [state, setState] = useState<SessionState>(initial);
  const conn = useRef<ReturnType<typeof connectRealtime> | null>(null);

  const start = useCallback(async (clientLabel: string, templateId?: string) => {
    const session = await api.createSession({ clientLabel, templateId, source: "live" });
    await api.consent(session.id);
    setState({ ...initial, phase: "recording", sessionId: session.id, clientLabel });

    conn.current = connectRealtime({
      onOpen: () => conn.current?.send({ type: "start", sessionId: session.id }),
      onMessage: (msg) => {
        setState((s) => {
          switch (msg.type) {
            case "partial":
              return { ...s, partial: { text: msg.text, speaker: msg.speaker } };
            case "segment":
              return { ...s, partial: null, segments: [...s.segments, msg.segment] };
            case "note.status":
              return { ...s, phase: msg.status === "done" ? "ready" : "writing" };
            case "note.section":
              return { ...s, sections: [...s.sections.filter((x) => x.key !== msg.section.key), msg.section] };
            case "note.risk":
              return { ...s, risks: [...s.risks, msg.flag] };
            case "note.done":
              return { ...s, noteId: msg.noteId };
            default:
              return s;
          }
        });
      },
    });
  }, []);

  const say = useCallback((text: string, speaker: "clinician" | "client") => {
    conn.current?.send({ type: "simulate", text, speaker });
  }, []);

  const playDemo = useCallback(async () => {
    for (const line of DEMO_SESSION) {
      conn.current?.send({ type: "simulate", text: line.text, speaker: line.speaker });
      await new Promise((r) => setTimeout(r, 700));
    }
  }, []);

  const stop = useCallback(() => {
    setState((s) => ({ ...s, phase: "writing", partial: null }));
    conn.current?.send({ type: "stop" });
  }, []);

  const refreshNote = useCallback(async (id: string) => {
    const note = await api.getNote(id);
    setState((s) => ({ ...s, note, sections: note.sections, risks: note.riskFlags }));
  }, []);

  const reset = useCallback(() => {
    conn.current?.ws.close();
    setState(initial);
  }, []);

  return { state, start, say, playDemo, stop, refreshNote, reset, setState };
}
