// Every audit entry is tagged with a college so each college admin only sees their own.
//   collegeId: pass it explicitly when the entry is about a college's facility (for
//   example a student's booking belongs to the FACILITY's college, not the student's).
//   If omitted, the acting user's own college is used.
async function writeAudit(dbOrConnection, { userId = null, action, entityType, entityId = null, details = null, req = null, collegeId } = {}) {
  const ip = req ? String(req.ip || '').slice(0, 64) : null;
  const college = collegeId !== undefined ? collegeId : (req && req.session && req.session.user ? req.session.user.college_id : null);
  await dbOrConnection.execute(
    `INSERT INTO audit_logs (user_id, college_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, college ?? null, action, entityType, entityId, details, ip]
  );
}
module.exports = { writeAudit };
