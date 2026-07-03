import type { NoteSection } from "@cura/shared";
import { cn } from "../primitives.js";

export interface NoteSectionCardProps {
  section: NoteSection;
  /** Highlight while streaming in from the note engine. */
  streaming?: boolean;
  className?: string;
}

/**
 * One section of a generated note (e.g. "Subjective"). Shows the section title,
 * content, and how many transcript segments back it (evidence linking).
 */
export function NoteSectionCard({ section, streaming = false, className }: NoteSectionCardProps) {
  const evidenceCount = section.evidence.length;
  return (
    <section
      aria-label={section.title}
      aria-busy={streaming || undefined}
      className={cn(
        "group relative overflow-hidden rounded-lg border border-line bg-bg-700/60 p-4",
        "transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift",
        streaming && "animate-pulse-glow",
        className,
      )}
    >
      {/* sheen that sweeps on hover — decorative */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 group-hover:translate-x-full"
      />
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wide text-text-mid">
          {section.title}
        </h3>
        {evidenceCount > 0 && (
          <span className="text-[11px] text-text-lo">
            {evidenceCount} {evidenceCount === 1 ? "source" : "sources"}
          </span>
        )}
      </header>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-hi">{section.content}</p>
    </section>
  );
}
