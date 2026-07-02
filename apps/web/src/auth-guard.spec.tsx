// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { ApiError } from "./api.js";
import { AuthProvider, useAuth } from "./state/auth.js";

const me = vi.fn();
vi.mock("./api.js", async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, api: { me: () => me() } };
});

/** A minimal guarded tree mirroring router.tsx's RequireAuth. */
function Guard() {
  const { identity, loading } = useAuth();
  if (loading) return <div>Loading…</div>;
  if (!identity) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function Harness() {
  return (
    <AuthProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<Guard />}>
            <Route path="/" element={<div>Dashboard content</div>} />
          </Route>
          <Route path="/login" element={<div>Login screen</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

afterEach(cleanup);

describe("auth guard", () => {
  it("redirects unauthenticated users to /login", async () => {
    me.mockRejectedValueOnce(new ApiError(401, "unauthorized"));
    render(<Harness />);
    await waitFor(() => expect(screen.getByText("Login screen")).toBeTruthy());
  });

  it("renders the app for an authenticated session", async () => {
    me.mockResolvedValueOnce({ orgId: "o1", userId: "u1", role: "clinician", permissions: ["notes:read"] });
    render(<Harness />);
    await waitFor(() => expect(screen.getByText("Dashboard content")).toBeTruthy());
  });
});
