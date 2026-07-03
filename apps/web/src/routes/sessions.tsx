import { Eyebrow, StatusChip, MotionList, MotionItem } from "@cura/ui";
import { useSessions } from "../state/queries.js";

/** All sessions for the org, tenant-scoped by the API session. */
export function SessionsRoute() {
  const { data: sessions, isLoading } = useSessions();
  return (
    <div className="space-y-4">
      <Eyebrow>Sessions</Eyebrow>
      {isLoading ? (
        <p className="text-sm text-text-lo">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-text-lo">
              <th className="py-2">Client</th>
              <th className="py-2">Source</th>
              <th className="py-2">Status</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>
          <MotionList as="tbody">
            {(sessions ?? []).map((s) => (
              <MotionItem as="tr" key={s.id} className="border-b border-line/60 transition-colors hover:bg-bg-700/30">
                <td className="py-2 text-text-hi">{s.clientLabel}</td>
                <td className="py-2 text-text-mid">{s.source}</td>
                <td className="py-2">
                  <StatusChip tone={s.status === "noted" ? "done" : "waiting"}>{s.status}</StatusChip>
                </td>
                <td className="py-2 text-text-lo">{new Date(s.createdAt).toLocaleDateString()}</td>
              </MotionItem>
            ))}
          </MotionList>
        </table>
      )}
    </div>
  );
}
