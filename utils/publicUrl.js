// Decides which web address gets printed into facility QR codes.
//
// Priority:  QR_BASE_URL  >  APP_URL  >  the address the admin is browsing.
// QR_BASE_URL lets you pin the printed codes to a permanent public address
// even if APP_URL (used in emails) changes later.
//
// The check-in token is independent of the domain, so changing the domain never
// invalidates a facility's token -- only the address printed on already-posted
// stickers is affected. See the in-app "Scan QR" page (/checkin), which reads any
// SpaceHub code and sends the user to the CURRENT site.

function clean(v) { return String(v || "").trim().replace(/\/+$/, ""); }

function isPrivateHost(host) {
  const h = String(host || "").toLowerCase();
  return h === "localhost" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".internal") ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "::1" || h === "[::1]" || !h.includes(".");
}

function qrBase(req) {
  const fromEnv = clean(process.env.QR_BASE_URL) || clean(process.env.APP_URL);
  const source = clean(process.env.QR_BASE_URL) ? "QR_BASE_URL" : clean(process.env.APP_URL) ? "APP_URL" : "request";
  const base = fromEnv || `${req.protocol}://${req.get("host")}`;
  let problem = null;
  try {
    const u = new URL(base);
    if (isPrivateHost(u.hostname)) {
      problem = `“${u.host}” is a local/private address. Codes printed with it only work on that network, not online.`;
    } else if (u.protocol !== "https:") {
      problem = "This address is not HTTPS. Phones may warn on it, and the camera scanner and secure login cookies need HTTPS.";
    }
  } catch (_) {
    problem = "The configured address is not a valid URL.";
  }
  return { base, source, problem, configured: source !== "request" };
}

module.exports = { qrBase, isPrivateHost };
