import type { AuditLog } from "@cura/audit";
import type { AgentAudit, AgentAuditEvent } from "@cura/agents";

/**
 * Bridges the agent runtime's {@link AgentAudit} onto the platform's hash-chained
 * {@link AuditLog} (Phase 04), so front-desk agent activity lands in the SAME
 * tamper-evident, tenant-scoped trail as everything else. The specific agent
 * action (e.g. `agent.tool.approved`) is carried in `context.event` under the
 * stable `call.handled` audit action — context is metadata only, never PHI.
 */
export class AuditLogSink implements AgentAudit {
  constructor(
    private readonly audit: AuditLog,
    private readonly actor: string,
  ) {}

  async record(event: AgentAuditEvent): Promise<void> {
    await this.audit.record({
      orgId: event.orgId,
      actor: this.actor,
      action: "call.handled",
      resource: event.resource,
      phiTouched: false,
      context: { event: event.action, ...(event.context ?? {}) },
    });
  }
}
