import { NavLink, Outlet } from "react-router-dom";
import { Button } from "@cura/ui";
import { Logo } from "../components/Chrome.js";
import { useAuth } from "../state/auth.js";

/**
 * Authenticated app frame: brand, primary nav, identity + logout, and the routed
 * <Outlet/>. Nav items gate by permission (e.g. the audit trail needs
 * `audit:read`) so a clinician doesn't see admin surfaces. All chrome is
 * composed from `@cura/ui` — no bespoke colors in the app (Phase 12 mandate).
 */
const NAV: { to: string; label: string; permission?: string }[] = [
  { to: "/", label: "Dashboard" },
  { to: "/record", label: "Record" },
  { to: "/sessions", label: "Sessions" },
  { to: "/templates", label: "Templates" },
  { to: "/frontdesk", label: "Front desk", permission: "calls:manage" },
  { to: "/billing", label: "Billing", permission: "claims:read" },
  { to: "/audit", label: "Audit", permission: "audit:read" },
  { to: "/settings", label: "Settings" },
];

export function AppShell() {
  const { identity, logout, has } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg-900/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-container items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="flex items-center gap-1" aria-label="Primary">
              {NAV.filter((n) => !n.permission || has(n.permission)).map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/"}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm ${isActive ? "bg-bg-700/60 text-text-hi" : "text-text-mid hover:text-text-hi"}`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {identity && <span className="hidden text-sm text-text-mid sm:inline">{identity.role}</span>}
            <Button variant="outline" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-container flex-1 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
