import { useParams } from "react-router-dom";
import { Eyebrow } from "@cura/ui";
import { useNote } from "../state/queries.js";
import { NoteEditor } from "../components/NoteEditor.js";

/** View/edit a saved note by id (from the sessions list or a deep link). */
export function NoteRoute() {
  const { id } = useParams<{ id: string }>();
  const { data: note, isLoading } = useNote(id);

  if (isLoading) return <p className="text-sm text-text-lo">Loading note…</p>;
  if (!note) return <p className="text-sm text-text-lo">Note not found.</p>;

  return (
    <div className="space-y-4">
      <Eyebrow>Progress note · {note.format}</Eyebrow>
      <div className="max-w-2xl">
        <NoteEditor
          phase="ready"
          noteId={note.id}
          format={note.format}
          sections={note.sections}
          risks={note.riskFlags}
        />
      </div>
    </div>
  );
}
