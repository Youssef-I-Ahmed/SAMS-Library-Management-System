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

/**
 * Route middleware: after a successful response, records who did what.
 * Stores only field names that changed (not their values) plus a short label,
 * so student data and free text stay out of the log. A failed write is logged
 * to the console and never changes the response.
 */
export function audited(action, entityType, { entityId, label } = {}) {
  return (req, res, next) => {
    const send = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400 && req.auth) {
        const id = entityId ? entityId(req, body) : body?.data?.id ?? req.params?.id;
        const name = typeof action === 'function' ? action(req, body) : action;
        const fields = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? Object.keys(req.body) : [];
        Promise.resolve().then(async () => {
          const { prisma } = await import('../config/prisma.js');
          await writeAudit(prisma, {
            actor: req.auth, action: name, entityType, entityId: id ?? 'unknown',
            metadata: { fields, ...(label ? { label: String(label(req, body) ?? '').slice(0, 200) } : {}),
              ...(req.requestId ? { requestId: req.requestId } : {}) }
          });
        }).catch((error) => console.error(`[audit] ${name} not recorded: ${error?.code || error?.name || 'error'}`));
      }
      return send(body);
    };
    next();
  };
}

/** Fire-and-forget security event (denied access, failed sign-in). Never throws. */
export function recordSecurityEvent(action, { actor, entityId = 'request', metadata } = {}) {
  Promise.resolve().then(async () => {
    const { prisma } = await import('../config/prisma.js');
    await writeAudit(prisma, { actor, action, entityType: 'Security', entityId, metadata });
  }).catch((error) => console.error(`[audit] ${action} not recorded: ${error?.code || error?.name || 'error'}`));
}
