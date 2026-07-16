import { useCallback, useRef, useState } from "react";
import type { Note, NoteSection, RiskFlag, TranscriptSegment } from "@cura/shared";
import { api, connectRealtime } from "./api.js";
import { dictationSupported, startDictation, type Dictation } from "./audio/dictation.js";
import { startMicCapture, type MicCapture } from "./audio/mic.js";
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
  /** Effective server ASR from the `ready` handshake ("mock" → dictate on-device). */
  asrMode: string | null;
  micOn: boolean;
  /** Live mic stream while capturing — feeds the orb/waveform analyser. */
  micStream: MediaStream | null;
  micError: string | null;
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
  asrMode: null,
  micOn: false,
  micStream: null,
  micError: null,
};

export function useSession() {
  const [state, setState] = useState<SessionState>(initial);
  const conn = useRef<ReturnType<typeof connectRealtime> | null>(null);
  const mic = useRef<MicCapture | null>(null);
  const dictation = useRef<Dictation | null>(null);
  // Callbacks need the latest ASR mode without re-subscribing to the WS.
  const asrModeRef = useRef<string>("mock");

  const teardownMic = useCallback(() => {
    dictation.current?.stop();
    dictation.current = null;
    void mic.current?.stop();
    mic.current = null;
  }, []);

  const start = useCallback(async (clientLabel: string, templateId?: string) => {
    const session = await api.createSession({ clientLabel, templateId, source: "live" });
    await api.consent(session.id);
    setState({ ...initial, phase: "recording", sessionId: session.id, clientLabel });

    conn.current = connectRealtime({
      onOpen: () => conn.current?.send({ type: "start", sessionId: session.id }),
      onMessage: (msg) => {
        setState((s) => {
          switch (msg.type) {
            case "ready":
              asrModeRef.current = msg.asr ?? "mock";
              return { ...s, asrMode: msg.asr ?? "mock" };
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

  /**
   * Toggle real microphone capture. PCM16 chunks always stream over the WS
   * (harmless no-op for the mock ASR); when the server advertised `asr:"mock"`,
   * on-device Web Speech dictation supplies the transcript via `simulate`.
   */
  const toggleMic = useCallback(async () => {
    if (mic.current) {
      teardownMic();
      setState((s) => ({ ...s, micOn: false, micStream: null }));
      return;
    }
    try {
      const capture = await startMicCapture((chunk) => conn.current?.send({ type: "audio", chunk }));
      mic.current = capture;
      if (asrModeRef.current === "mock" && dictationSupported()) {
        dictation.current = startDictation((text) =>
          conn.current?.send({ type: "simulate", text, speaker: "clinician" }),
        );
      }
      setState((s) => ({ ...s, micOn: true, micStream: capture.stream, micError: null }));
    } catch {
      setState((s) => ({
        ...s,
        micError: "Microphone unavailable — check browser permissions. Demo mode still works.",
      }));
    }
  }, [teardownMic]);

  const playDemo = useCallback(async () => {
    for (const line of DEMO_SESSION) {
      conn.current?.send({ type: "simulate", text: line.text, speaker: line.speaker });
      await new Promise((r) => setTimeout(r, 700));
    }
  }, []);

  const stop = useCallback(() => {
    teardownMic();
    setState((s) => ({ ...s, phase: "writing", partial: null, micOn: false, micStream: null }));
    conn.current?.send({ type: "stop" });
  }, [teardownMic]);

  const refreshNote = useCallback(async (id: string) => {
    const note = await api.getNote(id);
    setState((s) => ({ ...s, note, sections: note.sections, risks: note.riskFlags }));
  }, []);

  const reset = useCallback(() => {
    teardownMic();
    conn.current?.ws.close();
    setState(initial);
  }, [teardownMic]);

  return { state, start, say, playDemo, stop, refreshNote, reset, setState, toggleMic };
}
