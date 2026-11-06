import { db, auditLogsTable } from "@workspace/db";

export interface AuditInput {
  storeId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel: string;
  actorUserId: string;
  actorName: string;
  details?: Record<string, unknown>;
}

export async function writeAuditLog(input: AuditInput): Promise<void> {
  await db.insert(auditLogsTable).values({
    storeId: input.storeId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    targetLabel: input.targetLabel,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    details: input.details ?? {},
  });
}
