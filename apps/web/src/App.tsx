import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { makeQueryClient } from "./state/queries.js";
import { AuthProvider } from "./state/auth.js";
import { router } from "./router.js";

/**
 * App root: providers (server cache + session) wrapping the routed application.
 * The app is thin — routing, data, and composition of `@cura/ui`; all business
 * capability lives in `libs/*` and the API (CONVENTIONS §8).
 */
const queryClient = makeQueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
