import AuditLog from "../schema/auditLogSchema";

export async function writeAuditLog({
  action,
  adminId,
  targetUserId,
  details,
}: {
  action: string;
  adminId: string;
  targetUserId?: string;
  details?: Record<string, unknown>;
}) {
  await AuditLog.create({
    action,
    admin_id: adminId,
    target_user_id: targetUserId,
    details,
  });
}
