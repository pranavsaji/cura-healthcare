import { Navigate, Outlet, createBrowserRouter } from "react-router-dom";
import { AppShell } from "./features/AppShell.js";
import { useAuth } from "./state/auth.js";
import { LoginRoute } from "./routes/login.js";
import { DashboardRoute } from "./routes/dashboard.js";
import { RecordRoute } from "./routes/record.js";
import { NoteRoute } from "./routes/note.js";
import { SessionsRoute } from "./routes/sessions.js";
import { TemplatesRoute } from "./routes/templates.js";
import { SettingsRoute } from "./routes/settings.js";
import { AuditRoute } from "./routes/audit.js";
import { RunsRoute } from "./routes/runs.js";
import { FrontdeskRoute } from "./routes/frontdesk.js";
import { BillingRoute } from "./routes/billing.js";

/**
 * Route table + auth guard. Unauthenticated access to any app route redirects to
 * /login (Phase 12 acceptance). The guard waits for the session probe so we
 * don't flash the login screen for an already-authenticated user.
 */
export function RequireAuth() {
  const { identity, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-text-mid" role="status" aria-live="polite">
        Loading…
      </div>
    );
  }
  if (!identity) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginRoute /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <DashboardRoute /> },
          { path: "/record", element: <RecordRoute /> },
          { path: "/note/:id", element: <NoteRoute /> },
          { path: "/sessions", element: <SessionsRoute /> },
          { path: "/templates", element: <TemplatesRoute /> },
          { path: "/frontdesk", element: <FrontdeskRoute /> },
          { path: "/billing", element: <BillingRoute /> },
          { path: "/audit", element: <AuditRoute /> },
          { path: "/runs/:resource", element: <RunsRoute /> },
          { path: "/settings", element: <SettingsRoute /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
