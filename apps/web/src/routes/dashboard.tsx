import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button, Eyebrow, StatusChip, Tilt, CountUp, MotionStagger, reveal, springs } from "@cura/ui";
import { useSessions } from "../state/queries.js";

/**
 * Dashboard: today's sessions at a glance + a one-click path into a new capture.
 * Data comes from TanStack Query (server cache); the app stays thin. Rows stagger
 * in and lift in 3D on hover — motion degrades to static under reduced motion.
 */
export function DashboardRoute() {
  const navigate = useNavigate();
  const { data: sessions, isLoading } = useSessions();
  const count = sessions?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Eyebrow>Today</Eyebrow>
          <h1 className="mt-1 font-display text-2xl text-text-hi">
            Your sessions
            {count > 0 && (
              <span className="ml-3 align-middle text-base text-text-lo">
                <CountUp value={count} /> total
              </span>
            )}
          </h1>
        </div>
        <Button onClick={() => navigate("/record")}>+ New session</Button>
      </div>

      {isLoading && <p className="text-sm text-text-lo">Loading sessions…</p>}

      {!isLoading && count === 0 && (
        <div className="animate-float rounded-lg border border-dashed border-line p-10 text-center text-text-mid">
          No sessions yet. Start your first capture.
        </div>
      )}

      {count > 0 && (
        <MotionStagger className="divide-y divide-line rounded-lg border border-line" stagger={0.05}>
          {(sessions ?? []).map((s) => (
            <motion.div key={s.id} variants={reveal}>
              <Tilt max={4} glare>
                <div className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-bg-700/30">
                  <div>
                    <div className="text-sm font-medium text-text-hi">{s.clientLabel}</div>
                    <div className="text-xs text-text-lo">
                      {s.source} · {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusChip tone={s.status === "noted" ? "done" : "waiting"}>{s.status}</StatusChip>
                    <motion.span whileHover={{ x: 3 }} transition={springs.snappy}>
                      <Link to={`/sessions`} className="text-sm text-mint-400 hover:underline">
                        Open →
                      </Link>
                    </motion.span>
                  </div>
                </div>
              </Tilt>
            </motion.div>
          ))}
        </MotionStagger>
      )}
    </div>
  );
}
