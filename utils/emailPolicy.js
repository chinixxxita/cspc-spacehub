// SpaceHub accounts must use a CSPC school email address.
// Domains come from ALLOWED_EMAIL_DOMAINS (comma-separated), default "cspc.edu.ph".

function allowedDomains() {
  return String(process.env.ALLOWED_EMAIL_DOMAINS || "cspc.edu.ph")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

function isCspcEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (value.length > 150) return false;
  const m = /^[^\s@]+@([^\s@]+)$/.exec(value);
  return Boolean(m) && allowedDomains().includes(m[1]);
}

function cspcEmailMessage() {
  return `Please use your CSPC email address (for example name@${allowedDomains()[0]}).`;
}

module.exports = { isCspcEmail, cspcEmailMessage, allowedDomains };
