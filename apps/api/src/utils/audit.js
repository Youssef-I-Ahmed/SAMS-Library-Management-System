// Writes one audit_logs row inside the caller's transaction (or client).
// Values are stored as given; never pass secrets or tokens here.
export async function writeAudit(db, { actor, action, entityType, entityId, oldValues, newValues, metadata, branchId }) {
  return db.auditLog.create({
    data: {
      actorUserId: actor?.id ?? null,
      action,
      entityType,
      entityId: String(entityId),
      branchId: branchId ?? null,
      oldValues: oldValues ?? undefined,
      newValues: newValues ?? undefined,
      metadata: metadata ?? undefined
    }
  });
}
