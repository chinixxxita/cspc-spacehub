// Creates the FIRST administrator for a college (CCS, CTHBM, CAS, CEA or CHS).
// After that, the college's admin can create more admins for their own college from
// the Admin Accounts page. A college admin can never create admins for another college,
// which is why this command line step exists.
//
//   node scripts/create-college-admin.js <COLLEGE_CODE> <school_id> "<Full Name>" <email> [password]
//   npm run create-college-admin -- CEA CEA-ADMIN01 "Juan Dela Cruz" juan@cspc.edu.ph
//
// With no password, a random temporary one is generated and printed ONCE. Either way the
// admin must choose a new password at first login.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../config/db");
const { isCspcEmail, cspcEmailMessage } = require("../utils/emailPolicy");

function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(14), (b) => chars[b % chars.length]).join("");
}

async function main() {
  const [codeArg, schoolId, fullName, emailArg, passwordArg] = process.argv.slice(2);
  if (!codeArg || !schoolId || !fullName || !emailArg) {
    console.error('Usage: node scripts/create-college-admin.js <COLLEGE_CODE> <school_id> "<Full Name>" <email> [password]');
    return 1;
  }
  const email = emailArg.trim().toLowerCase();
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(schoolId)) { console.error("School ID must be 2-30 letters, numbers, - or _."); return 1; }
  if (fullName.trim().length < 2 || fullName.trim().length > 150) { console.error("Full name must be 2-150 characters."); return 1; }
  if (!isCspcEmail(email)) { console.error(cspcEmailMessage()); return 1; }
  if (passwordArg && passwordArg.length < 12) { console.error("Password must be at least 12 characters."); return 1; }

  const [colleges] = await db.execute("SELECT id, code, name FROM colleges WHERE code = ? LIMIT 1", [codeArg.trim().toUpperCase()]);
  if (!colleges.length) {
    const [all] = await db.execute("SELECT code FROM colleges ORDER BY code");
    console.error(`Unknown college "${codeArg}". Valid codes: ${all.map((c) => c.code).join(", ")}`);
    return 1;
  }
  const college = colleges[0];

  const [dupes] = await db.execute("SELECT id FROM users WHERE school_id = ? OR email = ? LIMIT 1", [schoolId, email]);
  if (dupes.length) { console.error("That school ID or email is already registered."); return 1; }

  const password = passwordArg || tempPassword();
  const hash = await bcrypt.hash(password, 12);
  await db.execute(
    `INSERT INTO users (school_id, full_name, email, password_hash, role, status, must_change_password, college_id, terms_accepted_at)
     VALUES (?, ?, ?, ?, 'admin', 'Active', TRUE, ?, CURRENT_TIMESTAMP)`,
    [schoolId, fullName.trim(), email, hash, college.id]
  );
  await db.execute(
    `INSERT INTO audit_logs (user_id, college_id, action, entity_type, details) VALUES (NULL, ?, 'CREATE_ADMIN_ACCOUNT', 'user', ?)`,
    [college.id, `Created ${college.code} administrator ${schoolId} from the command line`]
  );

  console.log(`\nCreated ${college.code} administrator (${college.name}).`);
  console.log(`  School ID: ${schoolId}`);
  if (!passwordArg) console.log(`  Temporary password: ${password}   (shown once)`);
  console.log("They must choose a new password at first login.\n");
  return 0;
}

main()
  .then((code) => db.end().finally(() => process.exit(code)))
  .catch((err) => { console.error("Failed:", err.code || err.message); db.end().finally(() => process.exit(1)); });
