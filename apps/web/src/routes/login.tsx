import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Eyebrow, MotionReveal, Magnetic } from "@cura/ui";
import { Logo } from "../components/Chrome.js";
import { useAuth } from "../state/auth.js";

/**
 * Login. In production this is an SSO handoff (WorkOS); in dev we offer role
 * shortcuts so the whole app is usable keylessly. On success the router's guard
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
          <p className="mt-2 text-sm text-text-mid">Choose a role to enter the demo workspace.</p>
        </div>
        <div className="space-y-3">
          <Magnetic strength={0.15} className="block w-full">
            <Button className="w-full" disabled={busy} onClick={() => void signIn("clinician")}>
              Continue as clinician
            </Button>
          </Magnetic>
          <Magnetic strength={0.15} className="block w-full">
            <Button className="w-full" variant="outline" disabled={busy} onClick={() => void signIn("admin")}>
              Continue as admin
            </Button>
          </Magnetic>
        </div>
      </MotionReveal>
    </div>
  );
}
