const db = require("../config/db");

// Scopes an administrator to ONE college.
//
// Runs after the role check. It re-reads the admin from the database on every request
// (not from the session), so a demoted, deactivated or re-assigned admin loses access
// immediately. On success:
//   req.college = { id, code, name }   <- every admin query must filter by req.college.id
//   res.locals.adminCollege            <- for templates
//
// An admin with no college is refused (fail closed) instead of seeing everything.
async function requireCollegeAdmin(req, res, next) {
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.role, u.status, u.college_id, c.code, c.name
       FROM users u
       LEFT JOIN colleges c ON c.id = u.college_id
       WHERE u.id = ? LIMIT 1`,
      [req.session.user.id]
    );
    const u = rows[0];
    if (!u || u.role !== "admin" || u.status !== "Active") {
      return req.session.destroy(() => res.status(403).render("errors/403", { title: "Access Denied" }));
    }
    if (!u.college_id || !u.code) {
      return res.status(403).render("errors/403", {
        title: "No College Assigned",
        message: "Your administrator account is not assigned to a college yet. Please ask the system owner to assign one."
      });
    }
    req.college = { id: u.college_id, code: u.code, name: u.name };
    res.locals.adminCollege = req.college;
    next();
  } catch (err) { next(err); }
}

module.exports = { requireCollegeAdmin };
