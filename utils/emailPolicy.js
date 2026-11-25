
// Student accounts use the configured CSPC school email policy.
// Administrator accounts may use Gmail or CSPC email.

function allowedDomains() {
  return String(process.env.ALLOWED_EMAIL_DOMAINS || "cspc.edu.ph")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

// Existing validation: keep this for student registration.
function isCspcEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (value.length > 150) return false;

  const m = /^[^\s@]+@([^\s@]+)$/.exec(value);
  return Boolean(m) && allowedDomains().includes(m[1]);
}

// New validation: use this for administrator accounts.
function isAdminEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (value.length > 150) return false;

  const m = /^[^\s@]+@([^\s@]+)$/.exec(value);
  return Boolean(m) &&
    ["gmail.com", "cspc.edu.ph"].includes(m[1]);
}

function cspcEmailMessage() {
  return `Please use your CSPC email address (for example name@${allowedDomains()[0]}).`;
}

function adminEmailMessage() {
  return "Please use a valid Gmail or CSPC email address.";
}

module.exports = {
  isCspcEmail,
  isAdminEmail,
  cspcEmailMessage,
  adminEmailMessage,
  allowedDomains
};
