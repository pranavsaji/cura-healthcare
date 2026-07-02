import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";

/**
 * TanStack Query is the server-cache layer (Phase 12 mandate): declarative reads
 * with caching/refetch, and mutations that invalidate. Query keys are stable
 * arrays so invalidation is precise. The WS live stream is handled separately
 * (a small store) — Query owns REST state only.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 5_000, refetchOnWindowFocus: false },
    },
  });
}

export const keys = {
  templates: ["templates"] as const,
  sessions: ["sessions"] as const,
  session: (id: string) => ["session", id] as const,
  note: (id: string) => ["note", id] as const,
  audit: (filter: unknown) => ["audit", filter] as const,
  auditVerify: ["audit", "verify"] as const,
  run: (resource: string) => ["run", resource] as const,
};

export const useTemplates = () => useQuery({ queryKey: keys.templates, queryFn: api.templates });
export const useSessions = () => useQuery({ queryKey: keys.sessions, queryFn: api.sessions });
export const useNote = (id: string | undefined) =>
  useQuery({ queryKey: keys.note(id ?? ""), queryFn: () => api.getNote(id!), enabled: !!id });

export const useAudit = (filter?: Parameters<typeof api.audit>[0]) =>
  useQuery({ queryKey: keys.audit(filter ?? null), queryFn: () => api.audit(filter) });
export const useAuditVerify = () => useQuery({ queryKey: keys.auditVerify, queryFn: api.auditVerify });
export const useRun = (resource: string | undefined) =>
  useQuery({ queryKey: keys.run(resource ?? ""), queryFn: () => api.run(resource!), enabled: !!resource });

/** Edit a section with optimistic cache update; invalidates on settle. */
export function useEditSection(noteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sectionKey: string; content: string }) => api.editSection(noteId, v.sectionKey, v.content),
    onSuccess: (note) => qc.setQueryData(keys.note(noteId), note),
  });
}

export function useSignNote(noteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.sign(noteId),
    onSuccess: (note) => qc.setQueryData(keys.note(noteId), note),
  });
}

export function useSyncNote(noteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.sync(noteId),
    onSuccess: (res) => qc.setQueryData(keys.note(noteId), res.note),
  });
}
