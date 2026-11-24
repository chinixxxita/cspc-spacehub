// Email notifications for CSPC SpaceHub.
//
// Design rules:
//  - Email is optional. If SMTP_HOST is not set, every function here quietly does nothing.
//  - Email must never break a reservation action. Nothing here throws; failures are
//    logged (error code only, never credentials or message bodies).
//  - Callers invoke it AFTER the database transaction commits, without awaiting it,
//    so a slow mail server cannot slow down or roll back the request.
//  - A user receives email only if their account is Active and their
//    "Email notifications" setting is on (default on).

const { isCspcEmail } = require("./emailPolicy");

let transporter = null;
let initTried = false;

function isEnabled() {
  return Boolean(process.env.SMTP_HOST);
}

function getTransporter() {
  if (!isEnabled()) return null;
  if (initTried) return transporter;
  initTried = true;
  try {
    // Loaded lazily so the app still starts if the package is missing.
    const nodemailer = require("nodemailer");
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : port === 465; // 465 = implicit TLS; 587 = STARTTLS
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  } catch (err) {
    console.error("Email disabled: could not load nodemailer:", err.code || err.message);
    transporter = null;
  }
  return transporter;
}

function fromAddress() {
  return process.env.MAIL_FROM || `CSPC SpaceHub <${process.env.SMTP_USER || "no-reply@localhost"}>`;
}

// DATE columns may arrive as JS Date objects (local midnight) or as strings.
// Use local getters: toISOString() would shift the day in time zones ahead of UTC.
function formatDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function buildMessage({ heading, lines, linkPath }) {
  const base = (process.env.APP_URL || "").replace(/\/+$/, "");
  const link = base && linkPath ? `${base}${linkPath}` : "";
  const text = [heading, "", ...lines, ...(link ? ["", `Open in SpaceHub: ${link}`] : []), "",
    "You can turn off email notifications in SpaceHub under Settings."].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1b2a41">
  <div style="background:#102a56;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;font-weight:700">CSPC SpaceHub</div>
  <div style="border:1px solid #d9e0ea;border-top:0;padding:20px;border-radius:0 0 8px 8px">
    <h2 style="margin:0 0 12px;font-size:18px">${esc(heading)}</h2>
    ${lines.map((l) => `<p style="margin:0 0 10px;line-height:1.5">${esc(l)}</p>`).join("")}
    ${link ? `<p style="margin:18px 0"><a href="${esc(link)}" style="background:#2563c9;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open in SpaceHub</a></p>` : ""}
    <p style="margin:18px 0 0;font-size:12px;color:#6b7a90">You can turn off email notifications in SpaceHub under Settings.</p>
  </div></div>`;
  return { text, html };
}

async function recipientsFor(db, userIds) {
  const ids = [...new Set(userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return [];
  const marks = ids.map(() => "?").join(",");
  const [rows] = await db.execute(
    `SELECT u.email, u.full_name
       FROM users u
       LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE u.id IN (${marks}) AND u.status = 'Active'
        AND COALESCE(s.email_notifications, TRUE) = TRUE`,
    ids
  );
  // Older accounts may hold a non-CSPC address; they simply get no email.
  return rows.filter((r) => isCspcEmail(r.email));
}

// emailUsers(db, [userId, ...], { subject, heading, lines: [..], linkPath })
// Safe to call without await; it never rejects.
async function emailUsers(db, userIds, { subject, heading, lines, linkPath }) {
  try {
    const t = getTransporter();
    if (!t) return;
    const recipients = await recipientsFor(db, userIds);
    const { text, html } = buildMessage({ heading, lines, linkPath });
    for (const r of recipients) {
      try {
        await t.sendMail({ from: fromAddress(), to: r.email, subject, text, html });
      } catch (err) {
        console.error("Email send failed:", err.code || err.responseCode || err.message);
      }
    }
  } catch (err) {
    console.error("Email notification error:", err.code || err.message);
  }
}

// Used by scripts/test-email.js to verify SMTP settings. Returns a result instead of hiding errors.
async function sendTestEmail(to) {
  const t = getTransporter();
  if (!t) throw new Error("SMTP_HOST is not set (or nodemailer is not installed).");
  await t.verify();
  const { text, html } = buildMessage({
    heading: "SpaceHub email test",
    lines: ["If you can read this, SpaceHub can send email."],
    linkPath: "/"
  });
  return t.sendMail({ from: fromAddress(), to, subject: "SpaceHub email test", text, html });
}

module.exports = { emailUsers, isEnabled, sendTestEmail, formatDate };
