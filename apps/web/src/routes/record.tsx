import { Button, Eyebrow } from "@cura/ui";
import { useTemplates } from "../state/queries.js";
import { useSession } from "../useSession.js";
import { PipelineRail } from "../components/Chrome.js";
import { SetupCard } from "../components/SetupCard.js";
import { TranscriptPanel } from "../components/TranscriptPanel.js";
import { NoteEditor } from "../components/NoteEditor.js";

/**
 * The capture flow: consent → live transcript → the note writing itself. Real
 * mic capture streams over the WS (Phase 07); the "Play demo session" path keeps
 * the whole pipeline usable with no microphone and no API keys (used by the e2e).
 */
export function RecordRoute() {
  const { data: templates } = useTemplates();
  const { state, start, say, playDemo, stop, reset } = useSession();

  const format =
    templates?.find((t) => t.id === (state.note?.templateId ?? ""))?.format ??
    templates?.find((t) => t.isDefault)?.format ??
    "SOAP";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Eyebrow>Capture</Eyebrow>
          {state.clientLabel && <div className="mt-1 text-sm text-text-mid">Session · {state.clientLabel}</div>}
        </div>
        <PipelineRail phase={state.phase} />
      </div>

      {state.phase === "idle" ? (
        <SetupCard templates={templates ?? []} onStart={(label, tid) => start(label, tid)} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <TranscriptPanel
            phase={state.phase}
            segments={state.segments}
            partial={state.partial}
            onPlayDemo={playDemo}
            onSay={say}
            onStop={stop}
          />
          <NoteEditor
            phase={state.phase}
            noteId={state.noteId}
            format={format}
            sections={state.sections}
            risks={state.risks}
            transcript={state.segments}
          />
        </div>
      )}

      {state.phase === "ready" && (
        <footer className="flex items-center justify-between">
          <p className="text-sm text-text-mid">
            Note drafted from {state.segments.length} transcript segments · never auto-signed.
          </p>
          <Button variant="outline" onClick={reset}>
            New session
          </Button>
        </footer>
      )}
    </div>
  );
}
