const express = require("express");
const db = require("../config/db");
const { requireCollegeAdmin } = require("../middleware/college");

const router = express.Router();

// College-scoped administrator dashboard. Mounted in app.js BEFORE routes/dashboard.js:
// admins are handled here (their own college's numbers only); everyone else falls
// through (next) to the existing student/faculty dashboard.
router.get("/dashboard", (req, res, next) => {
  const u = req.session.user;
  if (!u || u.role !== "admin") return next();

  requireCollegeAdmin(req, res, async (err) => {
    if (err) return next(err);
    try {
      const cid = req.college.id;

      const [[counts]] = await db.execute(
        `SELECT SUM(r.status = 'Pending') AS pending, SUM(r.status = 'Approved') AS approved
         FROM reservations r JOIN rooms rm ON rm.id = r.room_id
         WHERE rm.college_id = ?`, [cid]);

      const [[rooms]] = await db.execute(
        `SELECT COUNT(*) AS total, SUM(type = 'Room') AS regular_rooms, SUM(type = 'Laboratory') AS laboratories
         FROM rooms WHERE college_id = ?`, [cid]);

      // Users who belong to this college (students and faculty).
      const [[users]] = await db.execute(
        `SELECT COUNT(*) AS total, SUM(role = 'student') AS students, SUM(role = 'faculty') AS faculty
         FROM users WHERE college_id = ? AND status = 'Active' AND role IN ('student', 'faculty')`, [cid]);

      const [pending] = await db.execute(
        `SELECT r.id, r.reference_no, u.full_name, u.role, rm.name AS room_name,
                DATE_FORMAT(r.reservation_date, '%Y-%m-%d') AS reservation_date,
                TIME_FORMAT(r.start_time, '%H:%i') AS start_time,
                TIME_FORMAT(r.end_time, '%H:%i') AS end_time
         FROM reservations r
         JOIN users u ON u.id = r.user_id
         JOIN rooms rm ON rm.id = r.room_id
         WHERE rm.college_id = ? AND r.status = 'Pending'
         ORDER BY r.created_at ASC
         LIMIT 8`, [cid]);

      res.render("admin/dashboard", { title: "Dashboard", counts, rooms, users, pending });
    } catch (e) { next(e); }
  });
});

module.exports = router;
