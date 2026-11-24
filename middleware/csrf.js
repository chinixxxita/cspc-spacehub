const crypto = require("crypto");

// Session-based CSRF protection (synchronizer token). No extra package needed.
// The token lives in the server-side session and must come back with every
// state-changing request, either as a hidden form field "_csrf" or an
// "x-csrf-token" header.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

function csrfProtection(req, res, next) {
  // A function, not a value, so the token is only generated on pages that
  // actually contain a form.
  res.locals.csrfToken = () => getToken(req);

  if (SAFE_METHODS.has(req.method)) return next();

  const sent = String((req.body && req.body._csrf) || req.get("x-csrf-token") || "");
  const expected = req.session.csrfToken || "";
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);

  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).render("errors/403", {
      title: "Invalid Request",
      message: "Your session expired or the form was invalid. Go back, refresh the page, and try again."
    });
  }
  next();
}

module.exports = { csrfProtection };
