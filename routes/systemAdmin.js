const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../config/db");
const { requireRole } = require("../middleware/auth");
const { writeAudit } = require("../utils/audit");
const { isAdminEmail, adminEmailMessage } = require("../utils/emailPolicy");

const router = express.Router();
router.use((req, res, next) => {
  console.log("[SYSTEM ADMIN ROUTER HIT]", req.method, req.originalUrl);
  next();
});
router.use("/system-admin", requireRole("system_admin"));

function temporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(18), b => chars[b % chars.length]).join("");
}

async function loadDashboardData() {
  const [colleges] = await db.execute(`
    SELECT c.id, c.code, c.name,
           u.id AS administrator_id, u.school_id, u.full_name, u.email,
           u.status AS administrator_status, u.must_change_password,
           u.created_at AS administrator_created_at
    FROM colleges c
    LEFT JOIN users u ON u.college_id = c.id AND u.role = 'college_admin'
    ORDER BY c.code
  `);
  return colleges;
}

async function renderDashboard(req, res, options = {}) {
  const colleges = await loadDashboardData();
  res.set("Cache-Control", "no-store");
  return res.render("system-admin/dashboard", {
    title: "System Administration",
    colleges,
    resetResult: options.resetResult || null
  });
}

router.get("/system-admin", async (req, res, next) => {
  try { await renderDashboard(req, res); }
  catch (err) { next(err); }
});

// Create one College Administrator account for a college. Inactive accounts still
// occupy the college's single administrator slot; reactivate or update that account.
router.post("/system-admin/college-admins", async (req, res, next) => {
  let connection;
  try {
    const collegeId = Number(req.body.college_id);
    const schoolId = String(req.body.school_id || "").trim();
    const fullName = String(req.body.full_name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!Number.isInteger(collegeId) || collegeId <= 0 || !/^[A-Za-z0-9_-]{2,30}$/.test(schoolId) || fullName.length < 2 || fullName.length > 150 || !isAdminEmail(email)) {
      req.flash("error", !isAdminEmail(email) ? adminEmailMessage() : "Please provide a valid college, full name, and Gmail or CSPC email.");
      return res.redirect("/system-admin");
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    const [collegeRows] = await connection.execute("SELECT id, code FROM colleges WHERE id=? LIMIT 1 FOR UPDATE", [collegeId]);
    if (!collegeRows.length) { await connection.rollback(); req.flash("error", "College not found."); return res.redirect("/system-admin"); }
    const [existingCollegeAdmin] = await connection.execute("SELECT id FROM users WHERE college_id=? AND role='college_admin' LIMIT 1 FOR UPDATE", [collegeId]);
    if (existingCollegeAdmin.length) { await connection.rollback(); req.flash("error", `A College Administrator account already exists for ${collegeRows[0].code}. Update or reactivate that account instead.`); return res.redirect("/system-admin"); }
    const [duplicates] = await connection.execute("SELECT id FROM users WHERE school_id=? OR email=? LIMIT 1", [schoolId, email]);
    if (duplicates.length) { await connection.rollback(); req.flash("error", "That School ID or email is already registered."); return res.redirect("/system-admin"); }

    const temp = temporaryPassword();
    const hash = await bcrypt.hash(temp, 12);
    const [created] = await connection.execute(`
      INSERT INTO users (school_id, full_name, email, password_hash, role, status, must_change_password, college_id, terms_accepted_at)
      VALUES (?, ?, ?, ?, 'college_admin', 'Active', TRUE, ?, CURRENT_TIMESTAMP)
    `, [schoolId, fullName, email, hash, collegeId]);
    await writeAudit(connection, {
      userId: req.session.user.id, action: "CREATE_COLLEGE_ADMIN", entityType: "user",
      entityId: String(created.insertId), details: `Created College Administrator ${schoolId} for ${collegeRows[0].code}`,
      req, collegeId
    });
    await connection.commit();
    return renderDashboard(req, res, { resetResult: { school_id: schoolId, full_name: fullName, password: temp, notice: "Account created. Share this temporary password securely; it is shown only once." } });
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    next(err);
  } finally { if (connection) connection.release(); }
});

router.post("/system-admin/college-admins/:id/update", async (req, res, next) => {
  let connection;
  try {
    const id = Number(req.params.id);
    const collegeId = Number(req.body.college_id);
    const fullName = String(req.body.full_name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(collegeId) || collegeId <= 0 || fullName.length < 2 || fullName.length > 150 || !isAdminEmail(email)) {
      req.flash("error", "Please provide a valid college, full name, and CSPC email.");
      return res.redirect("/system-admin");
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [targetRows] = await connection.execute("SELECT id, school_id, college_id FROM users WHERE id=? AND role='college_admin' LIMIT 1 FOR UPDATE", [id]);
    const [collegeRows] = await connection.execute("SELECT id, code FROM colleges WHERE id=? LIMIT 1", [collegeId]);
    if (!targetRows.length || !collegeRows.length) { await connection.rollback(); req.flash("error", "College Administrator or college not found."); return res.redirect("/system-admin"); }
    const [conflicts] = await connection.execute("SELECT id FROM users WHERE role='college_admin' AND college_id=? AND id<>? LIMIT 1 FOR UPDATE", [collegeId, id]);
    if (conflicts.length) { await connection.rollback(); req.flash("error", "That college already has a College Administrator account."); return res.redirect("/system-admin"); }
    const [duplicates] = await connection.execute("SELECT id FROM users WHERE email=? AND id<>? LIMIT 1", [email, id]);
    if (duplicates.length) { await connection.rollback(); req.flash("error", "That email address is already in use."); return res.redirect("/system-admin"); }
    await connection.execute("UPDATE users SET full_name=?, email=?, college_id=? WHERE id=?", [fullName, email, collegeId, id]);
    await writeAudit(connection, {
      userId: req.session.user.id, action: "UPDATE_COLLEGE_ADMIN", entityType: "user", entityId: String(id),
      details: `Updated College Administrator ${targetRows[0].school_id}; assigned college ${collegeRows[0].code}`,
      req, collegeId
    });
    await connection.commit();
    req.flash("success", "College Administrator details updated.");
    return res.redirect("/system-admin");
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    next(err);
  } finally { if (connection) connection.release(); }
});

router.post("/system-admin/college-admins/:id/status", async (req, res, next) => {
  let connection;
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || "");
    if (!Number.isInteger(id) || id <= 0 || !["Active", "Inactive"].includes(status)) {
      req.flash("error", "Invalid account or status.");
      return res.redirect("/system-admin");
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute("SELECT id, school_id, college_id FROM users WHERE id=? AND role='college_admin' LIMIT 1 FOR UPDATE", [id]);
    if (!rows.length) { await connection.rollback(); req.flash("error", "College Administrator not found."); return res.redirect("/system-admin"); }
    await connection.execute("UPDATE users SET status=? WHERE id=?", [status, id]);
    if (status === "Inactive") {
      try { await connection.execute("DELETE FROM sessions WHERE data LIKE ?", [`%"user":{"id":${id},%`]); } catch (_) {}
    }
    await writeAudit(connection, {
      userId: req.session.user.id, action: status === "Inactive" ? "DEACTIVATE_COLLEGE_ADMIN" : "REACTIVATE_COLLEGE_ADMIN",
      entityType: "user", entityId: String(id), details: `${status} College Administrator ${rows[0].school_id}`,
      req, collegeId: rows[0].college_id
    });
    await connection.commit();
    req.flash("success", `College Administrator account ${status.toLowerCase()}.`);
    return res.redirect("/system-admin");
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    next(err);
  } finally { if (connection) connection.release(); }
});

router.post("/system-admin/college-admins/:id/reset-password", async (req, res, next) => {
  let connection;
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { req.flash("error", "Invalid account."); return res.redirect("/system-admin"); }
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute("SELECT id, school_id, full_name, college_id FROM users WHERE id=? AND role='college_admin' LIMIT 1 FOR UPDATE", [id]);
    if (!rows.length) { await connection.rollback(); req.flash("error", "College Administrator not found."); return res.redirect("/system-admin"); }
    const temp = temporaryPassword();
    const hash = await bcrypt.hash(temp, 12);
    await connection.execute("UPDATE users SET password_hash=?, must_change_password=TRUE WHERE id=?", [hash, id]);
    try { await connection.execute("DELETE FROM sessions WHERE data LIKE ?", [`%"user":{"id":${id},%`]); } catch (_) {}
    await writeAudit(connection, {
      userId: req.session.user.id, action: "RESET_COLLEGE_ADMIN_PASSWORD", entityType: "user", entityId: String(id),
      details: `Reset password for College Administrator ${rows[0].school_id}; password change required at next login`,
      req, collegeId: rows[0].college_id
    });
    await connection.commit();
    return renderDashboard(req, res, { resetResult: { school_id: rows[0].school_id, full_name: rows[0].full_name, password: temp, notice: "Temporary password generated. It is shown only once; the administrator must change it at next login." } });
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    next(err);
  } finally { if (connection) connection.release(); }
});

module.exports = router;
