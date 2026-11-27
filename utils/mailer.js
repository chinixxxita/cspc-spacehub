
// Email notifications for CSPC SpaceHub.
//
// Production: Brevo HTTPS API.
// Local development: SMTP through Nodemailer.
//
// Email failures never break reservation or administration actions.
// Recipients must have an Active account and email notifications enabled.

let transporter = null;
let initTried = false;

function isBrevoEnabled() {
  return Boolean(process.env.BREVO_API_KEY);
}

function isSmtpEnabled() {
  return Boolean(process.env.SMTP_HOST);
}

function isEnabled() {
  return isBrevoEnabled() || isSmtpEnabled();
}

function getTransporter() {
  if (!isSmtpEnabled()) return null;
  if (initTried) return transporter;

  initTried = true;

  try {
    const nodemailer = require("nodemailer");
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : port === 465;

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  } catch (err) {
    console.error(
      "SMTP initialization failed:",
      err.code || err.message
    );
    transporter = null;
  }

  return transporter;
}

// Supports:
// CSPC SpaceHub <sender@example.com>
// sender@example.com
function getSender() {
  const configured = process.env.MAIL_FROM || process.env.SMTP_USER || "";

  const match = configured.match(/^(.*?)\s*<([^<>]+)>$/);

  if (match) {
    return {
      name: match[1].replace(/^["']|["']$/g, "").trim() || "CSPC SpaceHub",
      email: match[2].trim()
    };
  }

  return {
    name: "CSPC SpaceHub",
    email: configured.trim()
  };
}

// DATE columns may arrive as JS Date objects or strings.
function formatDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const p = (n) => String(n).padStart(2, "0");

    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }

  return String(v).slice(0, 10);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function buildMessage({ heading, lines, linkPath }) {
  const base = (process.env.APP_URL || "").replace(/\/+$/, "");
  const link = base && linkPath ? `${base}${linkPath}` : "";

  const text = [
    heading,
    "",
    ...lines,
    ...(link ? ["", `Open in SpaceHub: ${link}`] : []),
    "",
    "You can turn off email notifications in SpaceHub under Settings."
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1b2a41">
      <div style="background:#102a56;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;font-weight:700">
        CSPC SpaceHub
      </div>
      <div style="border:1px solid #d9e0ea;border-top:0;padding:20px;border-radius:0 0 8px 8px">
        <h2 style="margin:0 0 12px;font-size:18px">${esc(heading)}</h2>
        ${lines.map((l) => `<p style="margin:0 0 10px;line-height:1.5">${esc(l)}</p>`).join("")}
        ${link ? `<p style="margin:18px 0"><a href="${esc(link)}" style="background:#2563c9;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open in SpaceHub</a></p>` : ""}
        <p style="margin:18px 0 0;font-size:12px;color:#6b7a90">
          You can turn off email notifications in SpaceHub under Settings.
        </p>
      </div>
    </div>
  `;

  return { text, html };
}

async function recipientsFor(db, userIds) {
  const ids = [
    ...new Set(
      userIds.map(Number).filter(
        (n) => Number.isInteger(n) && n > 0
      )
    )
  ];

  if (!ids.length) return [];

  const marks = ids.map(() => "?").join(",");

  const [rows] = await db.execute(
    `SELECT u.email, u.full_name
       FROM users u
       LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE u.id IN (${marks})
        AND u.status = 'Active'
        AND COALESCE(s.email_notifications, TRUE) = TRUE
        AND u.email IS NOT NULL
        AND TRIM(u.email) <> ''`,
    ids
  );

  // Allow both CSPC and Gmail recipients.
  return rows;
}

// Send through Brevo's HTTPS API.
async function sendWithBrevo({ to, subject, text, html }) {
  if (typeof fetch !== "function") {
    throw new Error("Node.js fetch is unavailable. Use Node.js 18 or newer.");
  }

  const sender = getSender();

  if (!sender.email) {
    throw new Error("MAIL_FROM or SMTP_USER sender email is missing.");
  }

  const response = await fetch(
    "https://api.brevo.com/v3/smtp/email",
    {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html
      }),
      signal: AbortSignal.timeout(15000)
    }
  );

  if (!response.ok) {
    const body = await response.text();

    console.error(
      "Brevo email failed:",
      response.status,
      body.slice(0, 500)
    );

    throw new Error(`Brevo API returned HTTP ${response.status}`);
  }

  const result = await response.json();

  console.log("Email accepted by Brevo:", to);

  return result;
}

async function sendWithSmtp({ to, subject, text, html }) {
  const t = getTransporter();

  if (!t) {
    throw new Error("SMTP transporter is unavailable.");
  }

  const result = await t.sendMail({
    from: process.env.MAIL_FROM || `CSPC SpaceHub <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html
  });

  console.log("Email accepted by SMTP:", to);

  return result;
}

// Brevo takes priority when BREVO_API_KEY is configured.
// SMTP remains available for localhost development.
async function sendMessage(message) {
  if (isBrevoEnabled()) {
    return sendWithBrevo(message);
  }

  if (isSmtpEnabled()) {
    return sendWithSmtp(message);
  }

  throw new Error("No email provider is configured.");
}

// Safe to call without await. It never rejects.
async function emailUsers(
  db,
  userIds,
  { subject, heading, lines, linkPath }
) {
  try {
    if (!isEnabled()) {
      console.warn("Email skipped: no email provider configured.");
      return;
    }

    const recipients = await recipientsFor(db, userIds);

    if (!recipients.length) {
      console.log("Email skipped: no eligible recipients.");
      return;
    }

    const { text, html } = buildMessage({
      heading,
      lines,
      linkPath
    });

    for (const recipient of recipients) {
      try {
        await sendMessage({
          to: recipient.email,
          subject,
          text,
          html
        });
      } catch (err) {
        console.error(
          "Email delivery failed for recipient:",
          recipient.email,
          err.message
        );
      }
    }
  } catch (err) {
    console.error("Email notification error:", err.message);
  }
}

// Used by scripts/test-email.js.
// Sends through the currently configured provider.
async function sendTestEmail(to) {
  if (!isEnabled()) {
    throw new Error("No email provider is configured.");
  }

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("A valid recipient email address is required.");
  }

  const { text, html } = buildMessage({
    heading: "SpaceHub email test",
    lines: [
      "If you can read this, SpaceHub can send email."
    ],
    linkPath: "/"
  });

  return sendMessage({
    to,
    subject: "SpaceHub email test",
    text,
    html
  });
}

module.exports = {
  emailUsers,
  isEnabled,
  sendTestEmail,
  formatDate
};
