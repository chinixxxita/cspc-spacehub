const db = require("../config/db");

function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash("error", "Please log in to continue.");
    return res.redirect("/login");
  }
  next();
}

// Elevated roles are checked against the database on every request. This prevents
// a stale session from retaining System Administrator privileges after demotion
// or deactivation. Ordinary role checks remain session-based.
function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.session.user) {
      req.flash("error", "Please log in to continue.");
      return res.redirect("/login");
    }

    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render("errors/403", { title: "Access Denied" });
    }

    if (roles.includes("system_admin")) {
      try {
        const [rows] = await db.execute(
          "SELECT role, status, college_id FROM users WHERE id = ? LIMIT 1",
          [req.session.user.id]
        );
        const user = rows[0];
        if (!user || user.role !== "system_admin" || user.status !== "Active" || user.college_id !== null) {
          return req.session.destroy(() => res.status(403).render("errors/403", { title: "Access Denied" }));
        }
      } catch (err) {
        return next(err);
      }
    }

    next();
  };
}

module.exports = { requireAuth, requireRole };
