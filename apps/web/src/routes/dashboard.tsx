import { Link, useNavigate } from "react-router-dom";
import { Button, Eyebrow, StatusChip } from "@cura/ui";
import { useSessions } from "../state/queries.js";

/**
 * Dashboard: today's sessions at a glance + a one-click path into a new capture.
 * Data comes from TanStack Query (server cache); the app stays thin.
 */
export function DashboardRoute() {
  const navigate = useNavigate();
  const { data: sessions, isLoading } = useSessions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Eyebrow>Today</Eyebrow>
          <h1 className="mt-1 font-display text-2xl text-text-hi">Your sessions</h1>
        </div>
        <Button onClick={() => navigate("/record")}>+ New session</Button>
      </div>

      {isLoading && <p className="text-sm text-text-lo">Loading sessions…</p>}

      {!isLoading && (sessions?.length ?? 0) === 0 && (
        <div className="rounded-lg border border-dashed border-line p-10 text-center text-text-mid">
          No sessions yet. Start your first capture.
        </div>
      )}

      <ul className="divide-y divide-line rounded-lg border border-line">
        {(sessions ?? []).map((s) => (
          <li key={s.id} className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="text-sm font-medium text-text-hi">{s.clientLabel}</div>
              <div className="text-xs text-text-lo">
                {s.source} · {new Date(s.createdAt).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusChip tone={s.status === "noted" ? "done" : "waiting"}>{s.status}</StatusChip>
              <Link to={`/sessions`} className="text-sm text-mint-400 hover:underline">
                Open
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
