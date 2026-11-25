const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../config/db");
const { requireRole } = require("../middleware/auth");
const { requireCollegeAdmin } = require("../middleware/college");
const { writeAudit } = require("../utils/audit");
const { emailUsers, formatDate } = require("../utils/mailer");
const { isCspcEmail, cspcEmailMessage } = require("../utils/emailPolicy");
const { toCsv } = require("../utils/csv");
const { nowParts, toMinutes } = require("../utils/time");
const {
  CHECKIN_EARLY_MINUTES, loadForAttendance, checkInProblem, checkOutProblem,
  applyCheckIn, applyCheckOut, emailCheckOut
} = require("../utils/attendance");
const { toSvg } = require("../utils/qr");
const { newToken, ensureRoomTokens } = require("../utils/roomTokens");

const router = express.Router();
const adminOnly = requireRole("college_admin");

// Every route below is limited to the administrator's own college (req.college).
// Rule for this file: each query on rooms, reservations, maintenance, users or audit
// logs MUST filter by req.college.id, and each ":id" route must prove the record
// belongs to that college before touching it.
router.use(adminOnly);
router.use(requireCollegeAdmin);

router.get("/dashboard", async (req, res) => {
  // Keep the old admin URL working while /dashboard is the single sidebar entry.
  res.redirect("/dashboard");
});

router.get("/audit", async (req, res, next) => {
  try {
    const [logs] = await db.execute(`
      SELECT a.*, u.full_name, u.school_id, u.role
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.college_id = ?
      ORDER BY a.created_at DESC
      LIMIT 300
    `, [req.college.id]);
    res.render("admin/audit", { title: "Audit Trail", logs });
  } catch (err) { next(err); }
});

router.get("/maintenance", async (req, res, next) => {
  try {
    const [maintenance] = await db.execute(`
      SELECT m.*, rm.name AS room_name, rm.type AS room_type, u.full_name AS created_by_name
      FROM facility_maintenance m
      JOIN rooms rm ON rm.id = m.room_id
      JOIN users u ON u.id = m.created_by
      WHERE rm.college_id = ?
      ORDER BY m.start_date ASC, m.created_at DESC
    `, [req.college.id]);
    const [rooms] = await db.execute(`SELECT id, name, type FROM rooms WHERE college_id = ? ORDER BY type, name`, [req.college.id]);
    res.render("admin/maintenance", { title: "Facility Maintenance", maintenance, rooms, today: nowParts().date });
  } catch (err) { next(err); }
});

router.post("/maintenance", async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const roomId = Number(req.body.room_id);
    const startDate = String(req.body.start_date || "").trim();
    const endDate = String(req.body.end_date || "").trim();
    const reason = String(req.body.reason || "").trim();
    if (!Number.isInteger(roomId) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate || reason.length < 3 || reason.length > 255) {
      req.flash("error", "Please provide a valid facility, date range, and maintenance reason.");
      return res.redirect("/admin/maintenance");
    }
    await connection.beginTransaction();
    const [rooms] = await connection.execute(`SELECT id, name FROM rooms WHERE id=? AND college_id=? LIMIT 1`, [roomId, req.college.id]);
    if (!rooms.length) { await connection.rollback(); req.flash("error", "Facility not found."); return res.redirect("/admin/maintenance"); }
    const [conflicts] = await connection.execute(`
      SELECT reference_no FROM reservations
      WHERE room_id=? AND reservation_date BETWEEN ? AND ?
        AND status IN ('Pending','Approved')
      LIMIT 1
    `, [roomId, startDate, endDate]);
    if (conflicts.length) {
      await connection.rollback();
      req.flash("error", `Maintenance cannot be scheduled because reservation ${conflicts[0].reference_no} exists within the selected dates.`);
      return res.redirect("/admin/maintenance");
    }
    const [result] = await connection.execute(`INSERT INTO facility_maintenance (room_id,start_date,end_date,reason,status,created_by) VALUES (?,?,?,?,'Scheduled',?)`, [roomId,startDate,endDate,reason,req.session.user.id]);
    await writeAudit(connection, { userId:req.session.user.id, action:"SCHEDULE_MAINTENANCE", entityType:"facility_maintenance", entityId:result.insertId, details:`Scheduled ${rooms[0].name} from ${startDate} to ${endDate}: ${reason}`, req, collegeId: req.college.id });
    await connection.commit();
    req.flash("success", `Maintenance scheduled for ${rooms[0].name}.`);
    res.redirect("/admin/maintenance");
  } catch (err) { try { await connection.rollback(); } catch {} next(err); }
  finally { connection.release(); }
});

router.post("/maintenance/:id/cancel", async (req, res, next) => {
  try {
    const [rows] = await db.execute(`SELECT m.id,m.status,rm.name AS room_name FROM facility_maintenance m JOIN rooms rm ON rm.id=m.room_id WHERE m.id=? AND rm.college_id=? LIMIT 1`, [req.params.id, req.college.id]);
    if (!rows.length) { req.flash("error", "Maintenance schedule not found."); return res.redirect("/admin/maintenance"); }
    if (rows[0].status !== "Scheduled") { req.flash("error", "Only scheduled maintenance can be cancelled."); return res.redirect("/admin/maintenance"); }
    await db.execute(`UPDATE facility_maintenance SET status='Cancelled' WHERE id=?`, [req.params.id]);
    await writeAudit(db, { userId:req.session.user.id, action:"CANCEL_MAINTENANCE", entityType:"facility_maintenance", entityId:req.params.id, details:`Cancelled maintenance for ${rows[0].room_name}`, req, collegeId: req.college.id });
    req.flash("success", "Maintenance schedule cancelled.");
    res.redirect("/admin/maintenance");
  } catch (err) { next(err); }
});

router.post("/maintenance/:id/complete", async (req, res, next) => {
  try {
    const [rows] = await db.execute(`SELECT m.id,m.status,rm.name AS room_name FROM facility_maintenance m JOIN rooms rm ON rm.id=m.room_id WHERE m.id=? AND rm.college_id=? LIMIT 1`, [req.params.id, req.college.id]);
    if (!rows.length) { req.flash("error", "Maintenance schedule not found."); return res.redirect("/admin/maintenance"); }
    if (rows[0].status !== "Scheduled") { req.flash("error", "Only scheduled maintenance can be completed."); return res.redirect("/admin/maintenance"); }
    await db.execute(`UPDATE facility_maintenance SET status='Completed' WHERE id=?`, [req.params.id]);
    await writeAudit(db, { userId:req.session.user.id, action:"COMPLETE_MAINTENANCE", entityType:"facility_maintenance", entityId:req.params.id, details:`Completed maintenance for ${rows[0].room_name}`, req, collegeId: req.college.id });
    req.flash("success", "Maintenance marked as completed.");
    res.redirect("/admin/maintenance");
  } catch (err) { next(err); }
});

router.get("/requests", async (req, res, next) => {
  try {
    const status = req.query.status || "Pending";
    const allowed = ["Pending", "Approved", "Rejected", "Cancelled", "Completed", "All"];
    const filter = allowed.includes(status) ? status : "Pending";

    let sql = `
      SELECT r.*, u.school_id, u.full_name, u.email, u.role,
             rm.name AS room_name, rm.type AS room_type
      FROM reservations r
      JOIN users u ON u.id = r.user_id
      JOIN rooms rm ON rm.id = r.room_id
      WHERE rm.college_id = ?
    `;
    const params = [req.college.id];
    if (filter !== "All") {
      sql += ` AND r.status = ?`;
      params.push(filter);
    }
    sql += ` ORDER BY r.created_at DESC`;

    const [requests] = await db.execute(sql, params);
    res.render("admin/requests", { title: "Reservation Requests", requests, filter });
  } catch (err) { next(err); }
});

router.get("/requests/:id", async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT r.*, u.school_id, u.full_name, u.email, u.role,
             rm.name AS room_name, rm.type AS room_type, rm.building, rm.floor, rm.capacity,
             rm.air_conditioned, rm.has_computers, rm.computer_count,
             DATE_FORMAT(r.reservation_date, '%Y-%m-%d') AS d,
             TIME_FORMAT(r.start_time, '%H:%i:%s') AS st,
             TIME_FORMAT(r.end_time, '%H:%i:%s') AS et,
             DATE_FORMAT(r.checked_in_at, '%Y-%m-%d %H:%i') AS checked_in_text,
             DATE_FORMAT(r.checked_out_at, '%Y-%m-%d %H:%i') AS checked_out_text
      FROM reservations r
      JOIN users u ON u.id = r.user_id
      JOIN rooms rm ON rm.id = r.room_id
      WHERE r.id = ? AND rm.college_id = ?
      LIMIT 1
    `, [req.params.id, req.college.id]);

    if (!rows.length) return res.status(404).render("errors/404", { title: "Request Not Found" });
    const r0 = rows[0];
    const now = nowParts();
    const nowMin = toMinutes(now.time);
    const ended = r0.d < now.date || (r0.d === now.date && nowMin >= toMinutes(r0.et));
    const attendance = {
      checkedIn: Boolean(r0.checked_in_text),
      checkedOut: Boolean(r0.checked_out_text),
      canCheckIn: checkInProblem(r0, now) === null,
      canCheckOut: r0.status === "Approved" && Boolean(r0.checked_in_text) && !r0.checked_out_text,
      missed: ["Approved", "Completed"].includes(r0.status) && !r0.checked_in_text && ended,
      earlyMinutes: CHECKIN_EARLY_MINUTES
    };
    res.render("admin/request-detail", { title: "Reservation Request", reservation: r0, attendance });
  } catch (err) { next(err); }
});

router.post("/requests/:id/approve", async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(`
      SELECT r.*, rm.name AS room_name
      FROM reservations r JOIN rooms rm ON rm.id = r.room_id
      WHERE r.id = ? AND rm.college_id = ? LIMIT 1
    `, [req.params.id, req.college.id]);
    if (!rows.length) {
      await connection.rollback();
      req.flash("error", "Reservation request not found.");
      return res.redirect("/admin/requests");
    }

    const r = rows[0];
    if (r.status !== "Pending") {
      await connection.rollback();
      req.flash("error", "Only Pending reservations can be approved.");
      return res.redirect(`/admin/requests/${r.id}`);
    }

    const [conflicts] = await connection.execute(`
      SELECT id FROM reservations
      WHERE room_id = ? AND reservation_date = ?
        AND status = 'Approved'
        AND start_time < ? AND end_time > ?
        AND id <> ?
      LIMIT 1
    `, [r.room_id, r.reservation_date, r.end_time, r.start_time, r.id]);

    if (conflicts.length) {
      await connection.rollback();
      req.flash("error", "This request conflicts with an already approved reservation. It cannot be approved.");
      return res.redirect(`/admin/requests/${r.id}`);
    }

    await connection.execute(`UPDATE reservations SET status='Approved', rejection_reason=NULL WHERE id=?`, [r.id]);
    await writeAudit(connection, { userId:req.session.user.id, action:"APPROVE_RESERVATION", entityType:"reservation", entityId:r.id, details:`Approved ${r.reference_no}`, req, collegeId: req.college.id });
    await connection.execute(`
      INSERT INTO notifications (user_id, title, message)
      VALUES (?, ?, ?)
    `, [r.user_id, "Reservation Approved", `Your reservation ${r.reference_no} for ${r.room_name} has been approved.`]);

    await connection.commit();
    emailUsers(db, [r.user_id], {
      subject: `Reservation ${r.reference_no} approved`,
      heading: "Your reservation was approved",
      lines: [
        `Reservation ${r.reference_no} for ${r.room_name} has been approved.`,
        `Date: ${formatDate(r.reservation_date)}, ${r.start_time} to ${r.end_time}.`
      ],
      linkPath: `/reservations/${r.id}`
    });
    req.flash("success", `Reservation ${r.reference_no} approved.`);
    res.redirect(`/admin/requests/${r.id}`);
  } catch (err) {
    try { await connection.rollback(); } catch {}
    next(err);
  } finally { connection.release(); }
});

// Manual attendance (fallback to the QR scan): an admin records arrival/departure.
// The rules live in utils/attendance.js so they match the QR scan page exactly.
router.post("/requests/:id/checkin", async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const r = await loadForAttendance(connection, req.params.id, req.college.id);
    const back = r ? `/admin/requests/${r.id}` : "/admin/requests";
    const refuse = async (msg) => { await connection.rollback(); req.flash("error", msg); return res.redirect(back); };

    if (!r) return refuse("Reservation not found.");
    const problem = checkInProblem(r);
    if (problem) return refuse(problem);

    await applyCheckIn(connection, r, { userId: req.session.user.id, req, via: "admin" });
    await connection.commit();
    req.flash("success", `Checked in ${r.reference_no}.`);
    res.redirect(back);
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    next(err);
  } finally {
    connection.release();
  }
});

router.post("/requests/:id/checkout", async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const r = await loadForAttendance(connection, req.params.id, req.college.id);
    const back = r ? `/admin/requests/${r.id}` : "/admin/requests";
    const refuse = async (msg) => { await connection.rollback(); req.flash("error", msg); return res.redirect(back); };

    if (!r) return refuse("Reservation not found.");
    const problem = checkOutProblem(r);
    if (problem) return refuse(problem);

    await applyCheckOut(connection, r, { userId: req.session.user.id, req, via: "admin" });
    await connection.commit();
    emailCheckOut(db, r);
    req.flash("success", `Checked out ${r.reference_no}. The reservation is now completed.`);
    res.redirect(back);
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    next(err);
  } finally {
    connection.release();
  }
});

router.post("/requests/:id/complete", async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(`
      SELECT r.id, r.reference_no, r.user_id, r.status,
             DATE_FORMAT(r.reservation_date, '%Y-%m-%d') AS reservation_date,
             TIME_FORMAT(r.end_time, '%H:%i:%s') AS end_time, rm.name AS room_name
      FROM reservations r JOIN rooms rm ON rm.id = r.room_id
      WHERE r.id = ? AND rm.college_id = ? LIMIT 1 FOR UPDATE
    `, [req.params.id, req.college.id]);
    if (!rows.length) {
      await connection.rollback();
      req.flash("error", "Reservation not found.");
      return res.redirect("/admin/requests");
    }
    const r = rows[0];
    if (r.status !== "Approved") {
      await connection.rollback();
      req.flash("error", "Only approved reservations can be marked completed.");
      return res.redirect(`/admin/requests/${r.id}`);
    }
    const nowLocal = nowParts();
    const ended = r.reservation_date < nowLocal.date || (r.reservation_date === nowLocal.date && r.end_time <= nowLocal.time);
    if (!ended) {
      await connection.rollback();
      req.flash("error", "This reservation can be marked completed only after its scheduled end time.");
      return res.redirect(`/admin/requests/${r.id}`);
    }
    const stamp = nowParts();
    await connection.execute(
      `UPDATE reservations
          SET status='Completed',
              checked_out_at = IF(checked_in_at IS NOT NULL AND checked_out_at IS NULL, ?, checked_out_at)
        WHERE id=?`,
      [`${stamp.date} ${stamp.time}`, r.id]
    );
    await writeAudit(connection, { userId:req.session.user.id, action:"COMPLETE_RESERVATION", entityType:"reservation", entityId:r.id, details:`Marked ${r.reference_no} as completed`, req, collegeId: req.college.id });
    await connection.execute(`INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)`, [r.user_id, "Reservation Completed", `Your reservation ${r.reference_no} for ${r.room_name} has been marked completed.`]);
    await connection.commit();
    emailUsers(db, [r.user_id], {
      subject: `Reservation ${r.reference_no} completed`,
      heading: "Your reservation was marked completed",
      lines: [`Reservation ${r.reference_no} for ${r.room_name} has been marked completed.`],
      linkPath: `/reservations/${r.id}`
    });
    req.flash("success", `Reservation ${r.reference_no} marked as completed.`);
    res.redirect(`/admin/requests/${r.id}`);
  } catch (err) {
    try { await connection.rollback(); } catch {}
    next(err);
  } finally { connection.release(); }
});

router.post("/requests/:id/reject", async (req, res, next) => {
  try {
    const reason = String(req.body.rejection_reason || "").trim();
    if (!reason) {
      req.flash("error", "A rejection reason is required.");
      return res.redirect(`/admin/requests/${req.params.id}`);
    }

    const [rows] = await db.execute(`
      SELECT r.id, r.reference_no, r.user_id, r.status, rm.name AS room_name
      FROM reservations r JOIN rooms rm ON rm.id=r.room_id WHERE r.id=? AND rm.college_id=? LIMIT 1
    `, [req.params.id, req.college.id]);
    if (!rows.length) {
      req.flash("error", "Reservation request not found.");
      return res.redirect("/admin/requests");
    }
    if (rows[0].status !== "Pending") {
      req.flash("error", "Only Pending reservations can be rejected.");
      return res.redirect(`/admin/requests/${req.params.id}`);
    }

    await db.execute(`UPDATE reservations SET status='Rejected', rejection_reason=? WHERE id=?`, [reason, req.params.id]);
    await writeAudit(db, { userId:req.session.user.id, action:"REJECT_RESERVATION", entityType:"reservation", entityId:req.params.id, details:`Rejected ${rows[0].reference_no}: ${reason}`, req, collegeId: req.college.id });
    await db.execute(`
      INSERT INTO notifications (user_id, title, message)
      VALUES (?, ?, ?)
    `, [rows[0].user_id, "Reservation Rejected", `Your reservation ${rows[0].reference_no} for ${rows[0].room_name} was rejected. Reason: ${reason}`]);

    emailUsers(db, [rows[0].user_id], {
      subject: `Reservation ${rows[0].reference_no} not approved`,
      heading: "Your reservation was not approved",
      lines: [
        `Reservation ${rows[0].reference_no} for ${rows[0].room_name} was rejected.`,
        `Reason: ${reason}`
      ],
      linkPath: `/reservations/${req.params.id}`
    });
    req.flash("success", `Reservation ${rows[0].reference_no} rejected.`);
    res.redirect(`/admin/requests/${req.params.id}`);
  } catch (err) { next(err); }
});

router.get("/rooms", async (req, res, next) => {
  try {
    const [rooms] = await db.execute(`SELECT * FROM rooms WHERE college_id = ? ORDER BY type, name`, [req.college.id]);
    const [maintenance] = await db.execute(`
      SELECT m.*, rm.name AS room_name
      FROM facility_maintenance m JOIN rooms rm ON rm.id=m.room_id
      WHERE rm.college_id = ? AND m.status='Scheduled' AND m.end_date >= ?
      ORDER BY m.start_date, rm.name
    `, [req.college.id, nowParts().date]);
    res.render("admin/rooms", { title: "Manage Rooms & Laboratories", rooms, maintenance });
  } catch (err) { next(err); }
});

router.get("/rooms/new", (req, res) => res.render("admin/room-form", { title: "Add Facility", room: null }));
router.get("/rooms/:id/edit", async (req, res, next) => {
  try {
    const [rows] = await db.execute(`SELECT * FROM rooms WHERE id=? AND college_id=? LIMIT 1`, [req.params.id, req.college.id]);
    if (!rows.length) return res.status(404).render("errors/404", { title: "Facility Not Found" });
    res.render("admin/room-form", { title: "Edit Facility", room: rows[0] });
  } catch (err) { next(err); }
});

router.post("/rooms/save", async (req, res, next) => {
  try {
    const { id, name, type, building, floor, capacity, air_conditioned, has_computers, computer_count, description, status } = req.body;
    const safeType = ["Room", "Laboratory"].includes(type) ? type : "Room";
    const safeStatus = ["Available", "Unavailable", "Maintenance"].includes(status) ? status : "Available";
    const cap = Number(capacity);
    const pcs = safeType === "Laboratory" && has_computers === "on" ? Math.max(0, Number(computer_count || 0)) : 0;
    if (!name || !Number.isInteger(cap) || cap < 1) {
      req.flash("error", "Facility name and a valid capacity are required.");
      return res.redirect(id ? `/admin/rooms/${id}/edit` : "/admin/rooms/new");
    }

    if (id) {
      // The facility must belong to this admin's college.
      const [own] = await db.execute(`SELECT id FROM rooms WHERE id=? AND college_id=? LIMIT 1`, [id, req.college.id]);
      if (!own.length) {
        req.flash("error", "Facility not found.");
        return res.redirect("/admin/rooms");
      }
      await db.execute(`UPDATE rooms SET name=?, type=?, building=?, floor=?, capacity=?, air_conditioned=?, has_computers=?, computer_count=?, description=?, status=? WHERE id=? AND college_id=?`,
        [name.trim(), safeType, building || null, floor || null, cap, air_conditioned === "on", pcs > 0, pcs, description || null, safeStatus, id, req.college.id]);
      await writeAudit(db, { userId:req.session.user.id, action:"UPDATE_FACILITY", entityType:"room", entityId:id, details:`Updated facility ${name.trim()}`, req, collegeId: req.college.id });
      req.flash("success", "Facility updated successfully.");
    } else {
      const [created] = await db.execute(`INSERT INTO rooms (college_id,name,type,building,floor,capacity,air_conditioned,has_computers,computer_count,description,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [req.college.id, name.trim(), safeType, building || null, floor || null, cap, air_conditioned === "on", pcs > 0, pcs, description || null, safeStatus]);
      await ensureRoomTokens(db);
      await writeAudit(db, { userId:req.session.user.id, action:"CREATE_FACILITY", entityType:"room", entityId:created.insertId, details:`Created facility ${name.trim()}`, req, collegeId: req.college.id });
      req.flash("success", "Facility added successfully.");
    }
    res.redirect("/admin/rooms");
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") req.flash("error", `${req.college.code} already has a facility with that name.`);
    else return next(err);
    res.redirect(req.body.id ? `/admin/rooms/${req.body.id}/edit` : "/admin/rooms/new");
  }
});

// ---- Facility QR codes (printed and posted at each room/lab) ----
const { qrBase } = require("../utils/publicUrl");
async function qrItems(req, ids) {
  await ensureRoomTokens(db);
  const [rooms] = ids
    ? await db.execute(`SELECT id, name, type, building, floor, checkin_token FROM rooms WHERE college_id = ? AND id IN (${ids.map(() => "?").join(",")})`, [req.college.id, ...ids])
    : await db.execute("SELECT id, name, type, building, floor, checkin_token FROM rooms WHERE college_id = ? ORDER BY type, name", [req.college.id]);
  const { base } = qrBase(req);
  return rooms.map((room) => {
    const url = `${base}/checkin/${room.checkin_token}`;
    return { room, url, svg: toSvg(url) };
  });
}

router.get("/rooms/qr", async (req, res, next) => {
  try {
    const items = await qrItems(req, null);
    res.render("admin/room-qr", { title: "Facility QR Codes", items, all: true, qr: qrBase(req) });
  } catch (err) { next(err); }
});

router.get("/rooms/:id/qr", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).render("errors/404", { title: "Facility Not Found" });
    const items = await qrItems(req, [id]);
    if (!items.length) return res.status(404).render("errors/404", { title: "Facility Not Found" });
    res.render("admin/room-qr", { title: `QR Code: ${items[0].room.name}`, items, all: false, qr: qrBase(req) });
  } catch (err) { next(err); }
});

// Replace a facility's token. Old printed codes stop working immediately
// (use if a code was copied, or the posted sticker was replaced).
router.post("/rooms/:id/qr/regenerate", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).render("errors/404", { title: "Facility Not Found" });
    const [result] = await db.execute("UPDATE rooms SET checkin_token = ? WHERE id = ? AND college_id = ?", [newToken(), id, req.college.id]);
    if (!result.affectedRows) return res.status(404).render("errors/404", { title: "Facility Not Found" });
    await writeAudit(db, { userId: req.session.user.id, action: "REGENERATE_QR", entityType: "room", entityId: id, details: "Regenerated facility check-in QR code", req, collegeId: req.college.id });
    req.flash("success", "New QR code generated. Print and post it; the old one no longer works.");
    res.redirect(`/admin/rooms/${id}/qr`);
  } catch (err) { next(err); }
});

router.post("/rooms/:id/status", async (req, res, next) => {
  try {
    const status = ["Available", "Unavailable", "Maintenance"].includes(req.body.status) ? req.body.status : "Unavailable";
    const [own] = await db.execute(`SELECT id FROM rooms WHERE id=? AND college_id=? LIMIT 1`, [req.params.id, req.college.id]);
    if (!own.length) {
      req.flash("error", "Facility not found.");
      return res.redirect("/admin/rooms");
    }
    await db.execute(`UPDATE rooms SET status=? WHERE id=? AND college_id=?`, [status, req.params.id, req.college.id]);
    await writeAudit(db, { userId:req.session.user.id, action:"CHANGE_FACILITY_STATUS", entityType:"room", entityId:req.params.id, details:`Changed facility status to ${status}`, req, collegeId: req.college.id });
    req.flash("success", `Facility status changed to ${status}.`);
    res.redirect("/admin/rooms");
  } catch (err) { next(err); }
});

router.get("/users", async (req, res, next) => {
  try {
    const [users] = await db.execute(`SELECT id, school_id, full_name, email, role, status, created_at FROM users WHERE college_id = ? ORDER BY created_at DESC`, [req.college.id]);
    res.render("admin/users", { title: "Manage Users", users, resetResult: null });
  } catch (err) { next(err); }
});

router.post("/users/:id/status", async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.session.user.id) {
      req.flash("error", "You cannot deactivate your own admin account.");
      return res.redirect("/admin/users");
    }
    const status = ["Active", "Inactive", "Pending"].includes(req.body.status) ? req.body.status : "Inactive";
    const [target] = await db.execute(`SELECT id, role FROM users WHERE id=? AND college_id=? LIMIT 1`, [req.params.id, req.college.id]);
    if (!target.length || ["admin", "college_admin", "system_admin"].includes(target[0].role)) {
      req.flash("error", "User not found or this account is managed by the System Administrator.");
      return res.redirect("/admin/users");
    }
    await db.execute(`UPDATE users SET status=? WHERE id=? AND college_id=?`, [status, req.params.id, req.college.id]);
    await writeAudit(db, { userId:req.session.user.id, action:"CHANGE_USER_STATUS", entityType:"user", entityId:req.params.id, details:`Changed user status to ${status}`, req, collegeId: req.college.id });
    req.flash("success", `User status changed to ${status}.`);
    res.redirect("/admin/users");
  } catch (err) { next(err); }
});

function generateTempPassword() {
  // No look-alike characters (0/O, 1/l/I) so it can be read out or typed easily.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(12), (b) => chars[b % chars.length]).join("");
}

// Reset a student/faculty password. The temporary password is shown once, on the
// response itself (never stored in the session or logs), and the user must change
// it at next login. Admin accounts are excluded so one admin cannot take over another.
router.post("/users/:id/reset-password", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      req.flash("error", "Invalid user.");
      return res.redirect("/admin/users");
    }
    if (id === req.session.user.id) {
      req.flash("error", "Use Settings > Security to change your own password.");
      return res.redirect("/admin/users");
    }
    const [rows] = await db.execute("SELECT id, school_id, full_name, role FROM users WHERE id=? AND college_id=? LIMIT 1", [id, req.college.id]);
    if (!rows.length) {
      req.flash("error", "User not found.");
      return res.redirect("/admin/users");
    }
    const target = rows[0];
    if (["admin", "college_admin", "system_admin"].includes(target.role)) {
      req.flash("error", "Administrator passwords cannot be reset from this page.");
      return res.redirect("/admin/users");
    }

    const temp = generateTempPassword();
    const hash = await bcrypt.hash(temp, 12);
    await db.execute("UPDATE users SET password_hash=?, must_change_password=TRUE WHERE id=?", [hash, id]);

    // Sign the user out everywhere. Best effort: the password is already changed.
    try {
      await db.execute("DELETE FROM sessions WHERE data LIKE ?", [`%"user":{"id":${id},%`]);
    } catch (sessionErr) {
      console.error("Could not clear sessions after password reset:", sessionErr.code || sessionErr.message);
    }

    await writeAudit(db, { userId: req.session.user.id, action: "RESET_USER_PASSWORD", entityType: "user", entityId: String(id), details: `Reset password for ${target.school_id}`, req, collegeId: req.college.id });

    const [users] = await db.execute("SELECT id, school_id, full_name, email, role, status, created_at FROM users WHERE college_id = ? ORDER BY created_at DESC", [req.college.id]);
    res.set("Cache-Control", "no-store");
    res.render("admin/users", {
      title: "Manage Users",
      users,
      resetResult: { school_id: target.school_id, full_name: target.full_name, password: temp }
    });
  } catch (err) { next(err); }
});

// College administrators cannot create or manage administrator accounts.
// Administrator provisioning is reserved for the System Administrator interface.
router.get("/admin-accounts", (req, res) => {
  return res.status(403).render("errors/403", { title: "Access Denied" });
});
router.post("/admin-accounts", (req, res) => {
  return res.status(403).render("errors/403", { title: "Access Denied" });
});

router.get("/reports", async (req, res, next) => {
  try {
    const [[summary]] = await db.execute(`
      SELECT COUNT(*) total,
             SUM(r.status='Pending') pending,
             SUM(r.status='Approved') approved,
             SUM(r.status='Rejected') rejected,
             SUM(r.status='Cancelled') cancelled,
             SUM(r.status='Completed') completed
      FROM reservations r JOIN rooms rm ON rm.id = r.room_id
      WHERE rm.college_id = ?
    `, [req.college.id]);
    const [byFacility] = await db.execute(`
      SELECT rm.name, rm.type, COUNT(r.id) reservations
      FROM rooms rm LEFT JOIN reservations r ON r.room_id=rm.id
      WHERE rm.college_id = ?
      GROUP BY rm.id, rm.name, rm.type ORDER BY reservations DESC, rm.name
    `, [req.college.id]);
    const [byPurpose] = await db.execute(`
      SELECT r.purpose, COUNT(*) total
      FROM reservations r JOIN rooms rm ON rm.id = r.room_id
      WHERE rm.college_id = ?
      GROUP BY r.purpose ORDER BY total DESC
    `, [req.college.id]);
    const [rooms] = await db.execute(`SELECT id, name FROM rooms WHERE college_id = ? ORDER BY type, name`, [req.college.id]);
    res.render("admin/reports", { title: "Reports", summary, byFacility, byPurpose, rooms });
  } catch (err) { next(err); }
});

// CSV export of reservations. Filters (all optional): from, to (booking date), room_id, status.
// Every value is validated, queries are parameterized, cells are protected against
// spreadsheet formula injection, and each export is recorded in the audit trail.
const EXPORT_STATUSES = ["Pending", "Approved", "Rejected", "Cancelled", "Completed"];
const EXPORT_MAX_ROWS = 50000;

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

router.get("/reports/export.csv", async (req, res, next) => {
  try {
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const roomId = String(req.query.room_id || "").trim();
    const status = String(req.query.status || "").trim();

    const fail = (msg) => { req.flash("error", msg); return res.redirect("/admin/reports"); };
    if (from && !validDate(from)) return fail("The 'from' date is not valid.");
    if (to && !validDate(to)) return fail("The 'to' date is not valid.");
    if (from && to && from > to) return fail("The 'from' date must not be after the 'to' date.");
    if (roomId && !/^\d{1,10}$/.test(roomId)) return fail("Invalid facility.");
    if (status && !EXPORT_STATUSES.includes(status)) return fail("Invalid status.");

    // Always limited to this college's facilities, whatever filters are sent.
    const where = ["rm.college_id = ?"];
    const params = [req.college.id];
    if (from) { where.push("r.reservation_date >= ?"); params.push(from); }
    if (to) { where.push("r.reservation_date <= ?"); params.push(to); }
    if (roomId) { where.push("r.room_id = ?"); params.push(Number(roomId)); }
    if (status) { where.push("r.status = ?"); params.push(status); }

    const [rows] = await db.execute(`
      SELECT r.reference_no,
             u.full_name, u.school_id, u.role,
             rm.name AS room_name, rm.type AS room_type,
             DATE_FORMAT(r.reservation_date, '%Y-%m-%d') AS d,
             TIME_FORMAT(r.start_time, '%H:%i') AS st,
             TIME_FORMAT(r.end_time, '%H:%i') AS et,
             r.purpose, r.number_of_users, r.status,
             DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i') AS submitted,
             DATE_FORMAT(r.checked_in_at, '%Y-%m-%d %H:%i') AS checked_in,
             DATE_FORMAT(r.checked_out_at, '%Y-%m-%d %H:%i') AS checked_out
      FROM reservations r
      JOIN users u ON u.id = r.user_id
      JOIN rooms rm ON rm.id = r.room_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY r.reservation_date, r.start_time, rm.name
      LIMIT ${EXPORT_MAX_ROWS}
    `, params);

    const csv = toCsv(
      ["Reference No", "Requester", "School ID", "Role", "Facility", "Facility Type", "Date", "Start", "End", "Purpose", "Number of Users", "Status", "Submitted", "Checked In", "Checked Out"],
      rows.map((r) => [r.reference_no, r.full_name, r.school_id, r.role, r.room_name, r.room_type, r.d, r.st, r.et, r.purpose, r.number_of_users, r.status, r.submitted, r.checked_in, r.checked_out])
    );

    await writeAudit(db, {
      userId: req.session.user.id,
      action: "EXPORT_REPORT",
      entityType: "report",
      details: `${req.college.code} CSV export of ${rows.length} reservation(s); from=${from || "any"} to=${to || "any"} room=${roomId || "all"} status=${status || "all"}`,
      req,
      collegeId: req.college.id
    });

    const stamp = nowParts().date;
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="spacehub-${req.college.code.toLowerCase()}-reservations-${stamp}.csv"`,
      "Cache-Control": "no-store"
    });
    res.send(csv);
  } catch (err) { next(err); }
});

module.exports = router;
