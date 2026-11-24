function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash("error", "Please log in to continue.");
    return res.redirect("/login");
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.flash("error", "Please log in to continue.");
      return res.redirect("/login");
    }

    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render("errors/403", {
        title: "Access Denied"
      });
    }

    next();
  };
}

module.exports = { requireAuth, requireRole };