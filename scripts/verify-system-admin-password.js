require("dotenv").config();
const readline = require("readline");
const bcrypt = require("bcryptjs");
const db = require("../config/db");

function askHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let value = "";
    process.stdout.write(prompt);
    const wasRaw = stdin.isRaw;
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
        } else if (key === "\u0003") {
          cleanup();
          process.exit(130);
        } else if (key === "\u007f" || key === "\b") {
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
    const password = await askHidden("Enter the same temporary password you used during setup: ");
    const [[user]] = await db.execute(
      "SELECT password_hash FROM users WHERE school_id = ? LIMIT 1",
      ["112026"]
    );

    if (!user) throw new Error("System Administrator account not found.");

    const matches = await bcrypt.compare(password, user.password_hash);
    console.log(matches
      ? "RESULT: PASSWORD MATCHES."
      : "RESULT: PASSWORD DOES NOT MATCH."
    );
  } catch (err) {
    console.error(err.message);
  } finally {
    await db.end();
  }
})();
