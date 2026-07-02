import { useState } from "react";
import { Button, Eyebrow, GlassPanel } from "@cura/ui";
import type { NoteTemplate } from "@cura/shared";

export function SetupCard({
  templates,
  onStart,
}: {
  templates: NoteTemplate[];
  onStart: (clientLabel: string, templateId: string) => void;
}) {
  const [label, setLabel] = useState("S. Mitchell · 32F");
  const [templateId, setTemplateId] = useState(templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? "");
  const [consent, setConsent] = useState(false);

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-container place-items-center px-6">
      <GlassPanel className="w-full max-w-lg p-8">
        <Eyebrow>New session</Eyebrow>
        <h1 className="mt-4 font-display text-3xl font-light leading-tight text-text-hi">
          Notes that write themselves.
        </h1>
        <p className="mt-2 text-sm text-text-mid">
          Start a session and Curanote listens, structures, and drafts a clinician-ready note in your format.
        </p>

        <label className="mt-6 block text-xs uppercase tracking-wider text-text-lo">Client (de-identified)</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-2 w-full rounded-md border border-line bg-bg-800 px-3 py-2.5 text-sm text-text-hi outline-none focus:border-mint-400/60"
        />

        <label className="mt-4 block text-xs uppercase tracking-wider text-text-lo">Note format</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="mt-2 w-full rounded-md border border-line bg-bg-800 px-3 py-2.5 text-sm text-text-hi outline-none focus:border-mint-400/60"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <label className="mt-6 flex items-start gap-3 text-sm text-text-mid">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 accent-[var(--mint-400)]"
          />
          <span>
            Client consent to record was obtained. Consent is logged to the audit trail before any audio is captured.
          </span>
        </label>

        <Button
          className="mt-6 w-full"
          disabled={!consent || !label.trim()}
          onClick={() => onStart(label.trim(), templateId)}
        >
          Start session →
        </Button>
      </GlassPanel>
    </div>
  );
}
