import { useState } from "react";
import { Button, Eyebrow, StatusChip, cn } from "@cura/ui";
import { renderNoteText, type NoteSection, type RiskFlag, type TranscriptSegment } from "@cura/shared";
import { api } from "../api.js";
import type { Phase } from "../useSession.js";

const RISK_LABEL: Record<string, string> = {
  suicidal_ideation: "Suicidal ideation",
  homicidal_ideation: "Homicidal ideation",
  abuse: "Abuse disclosure",
  mandated_reporting: "Mandated reporting",
};

export function NoteEditor({
  phase,
  noteId,
  format,
  sections,
  risks,
  transcript = [],
}: {
  phase: Phase;
  noteId: string | null;
  format: string;
  sections: NoteSection[];
  risks: RiskFlag[];
  /** Transcript segments, so evidence links can show the supporting span. */
  transcript?: TranscriptSegment[];
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"draft" | "reviewed" | "signed" | "synced">("draft");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);

  const segmentsFor = (starts: number[]) => transcript.filter((s) => starts.includes(s.start));

  const writing = phase === "writing";
  const ready = phase === "ready";
  const sorted = [...sections];

  async function saveSection(key: string) {
    if (!noteId) return;
    setSavingKey(key);
    await api.editSection(noteId, key, drafts[key] ?? "");
    setStatus("reviewed");
    setSavingKey(null);
  }

  async function sign() {
    if (!noteId) return;
    await api.sign(noteId);
    setStatus("signed");
  }

  async function superFill() {
    if (!noteId) return;
    const { formatted } = await api.sync(noteId);
    await navigator.clipboard.writeText(formatted).catch(() => {});
    setStatus("synced");
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <section className="flex h-full flex-col rounded-lg border border-line bg-bg-800/50">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <Eyebrow>Progress note · {format}</Eyebrow>
        <StatusChip tone={status === "synced" ? "done" : status === "signed" ? "done" : "waiting"}>
          {status}
        </StatusChip>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {risks.length > 0 && (
          <div className="space-y-2 rounded-md border border-danger/30 bg-danger/10 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-danger">
              ⚠ {risks.length} risk flag{risks.length > 1 ? "s" : ""} — clinician review required
            </div>
            {risks.map((r, i) => (
              <div key={i} className="text-sm text-text-hi">
                <span className="font-medium text-danger">{RISK_LABEL[r.kind] ?? r.kind}:</span>{" "}
                <span className="italic text-text-mid">“{r.quote}”</span>
              </div>
            ))}
          </div>
        )}

        {sorted.length === 0 && !writing && (
          <p className="text-sm text-text-lo">The generated note will stream in here after the session ends.</p>
        )}

        {writing && sorted.length === 0 && <SkeletonNote />}

        {sorted.map((sec) => (
          <div key={sec.key} className="animate-blur-in rounded-md border border-line bg-bg-700/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-hi">{sec.title}</h3>
              {sec.evidence.length > 0 && (
                <button
                  type="button"
                  aria-label={`Show ${sec.evidence.length} evidence link${sec.evidence.length > 1 ? "s" : ""} for ${sec.title}`}
                  aria-expanded={openEvidence === sec.key}
                  onClick={() => setOpenEvidence((k) => (k === sec.key ? null : sec.key))}
                  className="font-mono text-[11px] text-mint-400 hover:underline"
                >
                  {sec.evidence.length} evidence link{sec.evidence.length > 1 ? "s" : ""}
                </button>
              )}
            </div>
            {openEvidence === sec.key && (
              <div role="dialog" aria-label={`Evidence for ${sec.title}`} className="mb-3 space-y-1 rounded-md border border-mint-400/30 bg-mint-400/5 p-3">
                {segmentsFor(sec.evidence).length === 0 ? (
                  <p className="text-xs text-text-lo">Evidence references segments not in view.</p>
                ) : (
                  segmentsFor(sec.evidence).map((seg) => (
                    <p key={seg.start} className="text-xs text-text-mid">
                      <span className="font-mono text-text-lo">{seg.start.toFixed(1)}s</span> · {seg.speaker}: “{seg.text}”
                    </p>
                  ))
                )}
              </div>
            )}
            <textarea
              value={drafts[sec.key] ?? sec.content}
              onChange={(e) => setDrafts((d) => ({ ...d, [sec.key]: e.target.value }))}
              rows={Math.max(3, Math.ceil((drafts[sec.key] ?? sec.content).length / 60))}
              className="w-full resize-none rounded-md border border-transparent bg-transparent text-sm leading-relaxed text-text-hi outline-none focus:border-line focus:bg-bg-800/60 focus:p-3"
            />
            {(drafts[sec.key] ?? sec.content) !== sec.content && (
              <div className="mt-2 flex justify-end">
                <Button variant="outline" onClick={() => saveSection(sec.key)}>
                  {savingKey === sec.key ? "Saving…" : "Save edit"}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {ready && sorted.length > 0 && (
        <div className="flex items-center gap-3 border-t border-line px-5 py-4">
          <Button variant="outline" onClick={sign} className={cn(status !== "draft" && status !== "reviewed" && "opacity-60")}>
            Sign note
          </Button>
          <Button onClick={superFill} className="flex-1">
            {copied ? "✓ Copied for EHR" : "⚡ Super Fill → EHR"}
          </Button>
        </div>
      )}
    </section>
  );
}

function SkeletonNote() {
  return (
    <div className="space-y-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-md border border-line bg-bg-700/40 p-4">
          <div className="mb-3 h-3 w-24 rounded bg-white/10" />
          <div className="space-y-2">
            <div className="h-2.5 w-full rounded bg-white/5" />
            <div className="h-2.5 w-5/6 rounded bg-white/5" />
            <div className="h-2.5 w-2/3 rounded bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function copyNote(sections: NoteSection[]) {
  return renderNoteText({ sections });
}
