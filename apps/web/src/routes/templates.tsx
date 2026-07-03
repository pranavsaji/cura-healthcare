import { Eyebrow, StatusChip, Tilt, MotionList, MotionItem } from "@cura/ui";
import { useTemplates } from "../state/queries.js";

/** Template catalog — the data-driven note formats an org can generate. */
export function TemplatesRoute() {
  const { data: templates, isLoading } = useTemplates();
  return (
    <div className="space-y-4">
      <Eyebrow>Templates</Eyebrow>
      {isLoading ? (
        <p className="text-sm text-text-lo">Loading…</p>
      ) : (
        <MotionList as="div" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(templates ?? []).map((t) => (
            <MotionItem as="div" key={t.id}>
              <Tilt max={5} glare className="h-full rounded-lg border border-line bg-bg-800/50 p-4 transition-colors hover:border-line-strong">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text-hi">{t.name}</h3>
                  {t.isDefault && <StatusChip tone="done">default</StatusChip>}
                </div>
                <div className="text-xs text-text-lo">{t.format}</div>
                <ul className="mt-3 space-y-1 text-xs text-text-mid">
                  {t.sections.map((s) => (
                    <li key={s.key}>· {s.title}</li>
                  ))}
                </ul>
              </Tilt>
            </MotionItem>
          ))}
        </MotionList>
      )}
    </div>
  );
}
