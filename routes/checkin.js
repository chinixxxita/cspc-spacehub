const express = require("express");
const db = require("../config/db");
const { nowParts } = require("../utils/time");
const {
  CHECKIN_EARLY_MINUTES, loadForAttendance, checkInProblem, checkOutProblem,
  applyCheckIn, applyCheckOut, emailCheckOut
} = require("../utils/attendance");

const router = express.Router();
const TOKEN_RE = /^[a-f0-9]{32}$/;

// Every route here is reached by scanning a facility's QR code: /checkin/<token>.
// The token identifies the facility; WHO is checking in comes from the login session,
// and only that person's own approved reservation for that facility can be used.
async function gate(req, res, next) {
  try {
    const token = String(req.params.token || "");
    if (!TOKEN_RE.test(token)) return res.status(404).render("errors/404", { title: "QR Code Not Recognized" });
    const [rooms] = await db.execute(`SELECT rm.id, rm.name, rm.type, rm.building, rm.floor, c.code AS college_code
       FROM rooms rm JOIN colleges c ON c.id = rm.college_id
       WHERE rm.checkin_token = ? LIMIT 1`, [token]);
    if (!rooms.length) return res.status(404).render("errors/404", { title: "QR Code Not Recognized" });

    if (!req.session.user) {
      // Remember the scan so the user lands back here after logging in.
      if (req.method === "GET") req.session.returnTo = `/checkin/${token}`;
      req.flash("error", "Please log in to check in or out.");
      return res.redirect("/login");
    }
    req.room = rooms[0];
    req.token = token;
    next();
  } catch (err) { next(err); }
}

router.get("/:token", gate, async (req, res, next) => {
  try {
    const now = nowParts();
    const [rows] = await db.execute(`
      SELECT r.id, r.reference_no, r.user_id, r.status, r.checked_in_at, r.checked_out_at, r.purpose,
             DATE_FORMAT(r.reservation_date, '%Y-%m-%d') AS d,
             TIME_FORMAT(r.start_time, '%H:%i:%s') AS st,
             TIME_FORMAT(r.end_time, '%H:%i:%s') AS et,
             DATE_FORMAT(r.checked_in_at, '%H:%i') AS in_text
      FROM reservations r
      WHERE r.room_id = ? AND r.user_id = ? AND r.status = 'Approved'
        AND (DATE_FORMAT(r.reservation_date, '%Y-%m-%d') = ?
             OR (r.checked_in_at IS NOT NULL AND r.checked_out_at IS NULL))
      ORDER BY r.reservation_date, r.start_time
    `, [req.room.id, req.session.user.id, now.date]);

    const active = rows.find((r) => r.checked_in_at && !r.checked_out_at) || null;
    const ready = active ? null : rows.find((r) => checkInProblem(r, now) === null) || null;
    const upcoming = active || ready ? null : rows.find((r) => !r.checked_in_at) || null;
    res.render("checkin/scan", {
      title: "Facility Check-in",
      room: req.room, token: req.token, active, ready, upcoming,
      upcomingNote: upcoming ? checkInProblem(upcoming, now) : null,
      early: CHECKIN_EARLY_MINUTES
    });
  } catch (err) { next(err); }
});

router.post("/:token", gate, async (req, res, next) => {
  const back = `/checkin/${req.token}`;
  const action = String(req.body.action || "");
  const id = Number(req.body.reservation_id);
  if (!["checkin", "checkout"].includes(action) || !Number.isInteger(id) || id <= 0) {
    req.flash("error", "Invalid request. Please scan the QR code again.");
    return res.redirect(back);
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const r = await loadForAttendance(connection, id);
    const refuse = async (msg) => { await connection.rollback(); req.flash("error", msg); return res.redirect(back); };

    if (!r || Number(r.user_id) !== Number(req.session.user.id) || Number(r.room_id) !== Number(req.room.id)) {
      return refuse("That reservation is not yours at this facility.");
    }
    // The action is pinned by the form, so a double tap on "Check In" can never
    // turn into an accidental check-out.
    const problem = action === "checkin" ? checkInProblem(r) : checkOutProblem(r);
    if (problem) return refuse(problem);

    const ctx = { userId: req.session.user.id, req, via: "qr" };
    if (action === "checkin") await applyCheckIn(connection, r, ctx);
    else await applyCheckOut(connection, r, ctx);
    await connection.commit();

    if (action === "checkout") emailCheckOut(db, r);
    req.flash("success", action === "checkin"
      ? `You are checked in for ${r.reference_no}. Scan the code again when you leave to check out.`
      : `You are checked out. ${r.reference_no} is now completed. Thank you!`);
    res.redirect(back);
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    next(err);
  } finally {
    connection.release();
  }
});

module.exports = router;
