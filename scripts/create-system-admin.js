const { isAdminEmail, adminEmailMessage } = require("../utils/emailPolicy");
require("dotenv").config();
const readline = require("readline");
const bcrypt = require("bcryptjs");
const db = require("../config/db");

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, (answer) => resolve(answer.trim())));
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(prompt);
    let value = "";
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (chunk) => {
      const key = chunk.toString("utf8");
      if (key === "\u0003") {
        cleanup();
        process.exit(130);
      } else if (key === "\r" || key === "\n") {
        stdout.write("\n");
        cleanup();
        resolve(value);
      } else if (key === "\u007f" || key === "\b") {
        value = value.slice(0, -1);
      } else if (key >= " " && key !== "\u007f") {
        value += key;
      }
    };
    function cleanup() {
      stdin.removeListener("data", onData);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
    }
    stdin.on("data", onData);
  });
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run this command in an interactive terminal. Password input must not be piped.");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let connection;
  try {
    console.log("\nCSPC SpaceHub — one-time System Administrator bootstrap\n");
    console.log("This command creates the FIRST system_admin account only.");
    console.log("It does not create a college administrator.\n");

    const confirm = await ask(rl, 'Type "CREATE SYSTEM ADMIN" to continue: ');
    if (confirm !== "CREATE SYSTEM ADMIN") throw new Error("Confirmation did not match. No account was created.");

    const schoolId = await ask(rl, "System Administrator School ID: ");
    const fullName = await ask(rl, "Full name: ");
    const email = (await ask(rl, "CSPC email: ")).toLowerCase();
    rl.close();

    const password = await askHidden("Initial temporary password (input hidden): ");
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(schoolId)) throw new Error("School ID must be 2–30 letters, numbers, _ or -.");
    if (fullName.length < 2 || fullName.length > 150) throw new Error("Full name must be 2–150 characters.");
    if (!isAdminEmail(email)) {
  throw new Error(adminEmailMessage());
}
    if (password.length < 12 || password.length > 128 ||
        !/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
        !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      throw new Error("Password must be 12–128 characters and include uppercase, lowercase, number, and symbol.");
    }

    const [[schema]] = await db.execute(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`
    );
    if (!schema || !schema.COLUMN_TYPE.includes("'system_admin'")) {
      throw new Error("Database role migration is missing. Apply 20261125_system_admin_role.sql first.");
    }

    connection = await db.getConnection();
    const [[lock]] = await connection.query("SELECT GET_LOCK('cspc_spacehub_system_admin_bootstrap', 10) AS acquired");
    if (Number(lock.acquired) !== 1) throw new Error("Could not acquire bootstrap lock. Try again.");
    await connection.beginTransaction();

    const [[existing]] = await connection.query(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'system_admin' FOR UPDATE"
    );
    if (Number(existing.total) > 0) throw new Error("A System Administrator already exists. Bootstrap is permanently closed.");

    const [duplicates] = await connection.execute(
      "SELECT id FROM users WHERE school_id = ? OR email = ? LIMIT 1",
      [schoolId, email]
    );
    if (duplicates.length) throw new Error("That School ID or email is already in use.");

    const passwordHash = await bcrypt.hash(password, 12);
    const [created] = await connection.execute(
      `INSERT INTO users
       (school_id, full_name, email, password_hash, role, status, must_change_password, college_id)
       VALUES (?, ?, ?, ?, 'system_admin', 'Active', TRUE, NULL)`,
      [schoolId, fullName, email, passwordHash]
    );

    // Bootstrap has no existing actor. The actor is explicitly recorded as NULL;
    // no password or password hash is ever written to the audit details.
    await connection.execute(
      `INSERT INTO audit_logs (user_id, college_id, action, entity_type, entity_id, details)
       VALUES (NULL, NULL, 'BOOTSTRAP_SYSTEM_ADMIN', 'user', ?, ?)`,
      [String(created.insertId), `Initial System Administrator account created for School ID ${schoolId}`]
    );

    await connection.commit();
    console.log("\nSystem Administrator created successfully.");
    console.log(`School ID: ${schoolId}`);
    console.log("The initial password must be changed at first login.");
    console.log("Bootstrap is now closed because a system_admin account exists.\n");
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    throw error;
  } finally {
    if (connection) {
      try { await connection.query("SELECT RELEASE_LOCK('cspc_spacehub_system_admin_bootstrap')"); } catch (_) {}
      connection.release();
    }
  }
}

main()
  .catch((err) => {
    console.error(`Bootstrap failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
