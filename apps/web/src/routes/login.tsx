import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Eyebrow, MotionReveal, Magnetic } from "@cura/ui";
import { Logo } from "../components/Chrome.js";
import { useAuth } from "../state/auth.js";
import { api } from "../api.js";

// Dev role shortcuts (keyless) are only useful when the API runs the dev auth
// provider — i.e. local development. Production uses the WorkOS handoff.
const DEV = import.meta.env.DEV;

/**
 * Login. Production is a WorkOS AuthKit handoff (hosted email/password + social);
 * local dev also offers keyless role shortcuts. On success the router's guard
 * lets the user into the app.
 */
export function LoginRoute() {
  const { login, identity } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function signIn(role: string) {
    setBusy(true);
    try {
      await login(role);
      navigate("/", { replace: true });
    } finally {
      setBusy(false);
    }
  }

  if (identity) {
    navigate("/", { replace: true });
    return null;
  }

  return (
    <div className="grid min-h-screen place-items-center bg-bg-900 px-6">
      <MotionReveal className="w-full max-w-sm space-y-6 rounded-lg border border-line bg-bg-800/60 p-8 shadow-card">
        <div className="flex justify-center">
          <Logo />
        </div>
        <div className="text-center">
          <Eyebrow>Sign in</Eyebrow>
          <p className="mt-2 text-sm text-text-mid">Sign in to your Cura workspace.</p>
        </div>
        <div className="space-y-3">
          <Magnetic strength={0.15} className="block w-full">
            <Button className="w-full" disabled={busy} onClick={() => api.beginSso()}>
              Sign in with WorkOS
            </Button>
          </Magnetic>

          {DEV && (
            <>
              <div className="flex items-center gap-3 pt-1 text-2xs uppercase tracking-wide text-text-dim">
                <span className="h-px flex-1 bg-line" />
                dev shortcuts
                <span className="h-px flex-1 bg-line" />
              </div>
              <Magnetic strength={0.15} className="block w-full">
                <Button className="w-full" variant="outline" disabled={busy} onClick={() => void signIn("clinician")}>
                  Continue as clinician
                </Button>
              </Magnetic>
              <Magnetic strength={0.15} className="block w-full">
                <Button className="w-full" variant="outline" disabled={busy} onClick={() => void signIn("admin")}>
                  Continue as admin
                </Button>
              </Magnetic>
            </>
          )}
        </div>
      </MotionReveal>
    </div>
  );
}
