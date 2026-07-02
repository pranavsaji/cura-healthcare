import { and, eq } from "drizzle-orm";
import { type TranscriptSegment } from "@cura/shared";
import { transcripts } from "../schema.js";
import { BaseRepo } from "./base.js";

/**
 * Transcript segments per session. Stored as one row holding a JSONB array so
 * appends are a single read-modify-write within the tenant scope.
 */
export class TranscriptRepo extends BaseRepo {
  async get(orgId: string, sessionId: string): Promise<TranscriptSegment[]> {
    const [row] = await this.db
      .select()
      .from(transcripts)
      .where(and(eq(transcripts.orgId, orgId), eq(transcripts.sessionId, sessionId)))
      .limit(1);
    return row?.segments ?? [];
  }

  /** Append a segment, creating the transcript row on first write. */
  async append(orgId: string, sessionId: string, segment: TranscriptSegment): Promise<void> {
    await this.withTenant(orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(transcripts)
        .where(and(eq(transcripts.orgId, orgId), eq(transcripts.sessionId, sessionId)))
        .limit(1);
      if (row) {
        await tx
          .update(transcripts)
          .set({ segments: [...row.segments, segment] })
          .where(eq(transcripts.id, row.id));
      } else {
        await tx.insert(transcripts).values({ orgId, sessionId, segments: [segment] });
      }
    });
  }

  /** Replace the whole transcript (e.g. after a batch ASR run). */
  async replace(orgId: string, sessionId: string, segments: TranscriptSegment[]): Promise<void> {
    await this.withTenant(orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(transcripts)
        .where(and(eq(transcripts.orgId, orgId), eq(transcripts.sessionId, sessionId)))
        .limit(1);
      if (row) {
        await tx.update(transcripts).set({ segments }).where(eq(transcripts.id, row.id));
      } else {
        await tx.insert(transcripts).values({ orgId, sessionId, segments });
      }
    });
  }
}
