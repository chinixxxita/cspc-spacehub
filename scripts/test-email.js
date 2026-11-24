require("dotenv").config();
const { sendTestEmail } = require("../utils/mailer");

const to = process.argv[2];
if (!to) {
  console.log("Usage: npm run test-email -- you@example.com");
  process.exit(1);
}
sendTestEmail(to)
  .then((info) => console.log("Sent. Server response:", info.response || info.messageId))
  .catch((err) => {
    // Print the real reason (e.g. EAUTH, ECONNECTION, ETIMEDOUT) so it can be fixed.
    console.error("Email test failed:", err.code || "", err.message);
    process.exitCode = 1;
  });
