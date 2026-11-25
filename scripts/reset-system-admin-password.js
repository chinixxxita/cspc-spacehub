require("dotenv").config();
const readline = require("readline");
const bcrypt = require("bcryptjs");
const db = require("../config/db");

function askHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let value = "";
    const wasRaw = stdin.isRaw;
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();

    function cleanup() {
      stdin.removeListener("data", onData);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
    }

    function onData(chunk) {
      for (const key of chunk.toString("utf8")) {
        if (key === "\r" || key === "\n") {
          process.stdout.write("\n");
          cleanup();
          resolve(value);
          return;
        }
        if (key === "\u0003") {
          cleanup();
          process.exit(130);
        }
        if (key === "\u007f" || key === "\b") {
          value = value.slice(0, -1);
        } else if (key >= " " && key !== "\u007f") {
          value += key;
        }
      }
    }

    stdin.on("data", onData);
  });
}

(async () => {
  try {
    const password = await askHidden("New temporary password: ");

    if (
      password.length < 12 ||
      password.length > 128 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      throw new Error("Password must contain 12-128 characters, uppercase, lowercase, number and symbol.");
    }

    const hash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      "UPDATE users SET password_hash = ?, must_change_password = TRUE WHERE school_id = ? AND role = 'system_admin' AND status = 'Active'",
      [hash, "112026"]
    );

    if (result.affectedRows !== 1) {
      throw new Error("Expected exactly one active System Administrator account; no successful reset confirmed.");
    }

    const matches = await bcrypt.compare(password, hash);
    console.log("Password reset successful.");
    console.log("New password hash verified:", matches);
    console.log("School ID: 112026");
  } catch (error) {
    console.error("Reset failed:", error.message);
  } finally {
    await db.end();
  }
})();
