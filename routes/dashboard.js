const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/dashboard", requireAuth, async (req, res, next) => {
  try {
    const role = req.session.user.role;

    // College Admin dashboard is handled by adminDashboardRoutes.
    if (role === "college_admin") {
      return res.redirect("/dashboard");
    }

    // System Admin gets a separate overview.
    if (role === "system_admin") {
      const [[colleges]] = await db.execute(
        "SELECT COUNT(*) AS total FROM colleges"
      );

      const [[admins]] = await db.execute(
        `SELECT
          COUNT(*) AS total,
          SUM(status = 'Active') AS active
         FROM users
         WHERE role = 'college_admin'`
      );

      const [[users]] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM users
         WHERE role IN ('student', 'faculty')`
      );

      const [[reservations]] = await db.execute(
        `SELECT
          COUNT(*) AS total,
          SUM(status = 'Pending') AS pending,
          SUM(status = 'Approved') AS approved
         FROM reservations`
      );

      return res.render("system-admin/overview", {
        title: "Dashboard",
        colleges,
        admins,
        users,
        reservations
      });
    }

    // Existing student/faculty dashboard.
    const userId = req.session.user.id;

    const [reservations] = await db.execute(
      `SELECT r.reference_no, r.reservation_date, r.start_time, r.end_time,
              r.status, rm.name AS room_name, rm.type
       FROM reservations r
       JOIN rooms rm ON rm.id = r.room_id
       WHERE r.user_id = ?
       ORDER BY r.reservation_date DESC, r.start_time DESC
       LIMIT 5`,
      [userId]
    );

    const [counts] = await db.execute(
      `SELECT
        SUM(status = 'Pending') AS pending,
        SUM(status = 'Approved') AS approved,
        SUM(status = 'Rejected') AS rejected,
        SUM(status = 'Completed') AS completed
       FROM reservations
       WHERE user_id = ?`,
      [userId]
    );

    res.render("dashboard/index", {
      title: "Dashboard",
      reservations,
      counts: counts[0]
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;