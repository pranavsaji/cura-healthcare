/**
 * Zero-key transcription fallback via the Web Speech API. Used when the server
 * advertises `asr: "mock"` (no Deepgram/AssemblyAI key): recognized FINAL lines
 * ride the existing `simulate` WS path, which the server's ASR treats as its
 * documented dictation input. Chrome-only (recognition runs on Google's
 * servers) and single-speaker — lines are attributed to the clinician.
 */

// The DOM lib doesn't ship SpeechRecognition types — minimal ambient shapes.
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function dictationSupported(): boolean {
  return recognitionCtor() !== undefined;
}

export interface Dictation {
  stop(): void;
}

export function startDictation(onFinal: (text: string) => void): Dictation {
  const Ctor = recognitionCtor();
  if (!Ctor) throw new Error("Web Speech API not supported in this browser");
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = "en-US";
  rec.onresult = (ev) => {
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i]!;
      if (r.isFinal) {
        const text = r[0].transcript.trim();
        if (text) onFinal(text);
      }
    }
  };
  let active = true;
  // Chrome stops recognition after a silence window — restart until stopped.
  rec.onend = () => {
    if (active) {
      try {
        rec.start();
      } catch {
        /* already restarting */
      }
    }
  };
  rec.start();
  return {
    stop() {
      active = false;
      rec.stop();
    },
  };
}
