import { z } from "zod";

/** A page of results plus an opaque cursor for the next page (null = last page). */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

/** Encode a cursor payload to an opaque base64url string. */
export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** Decode an opaque cursor; returns null if malformed (treat as no cursor). */
export function decodeCursor<T = Record<string, unknown>>(cursor: string | undefined): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
