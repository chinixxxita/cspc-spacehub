const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const [rooms] = await db.execute(
      `SELECT rm.id, rm.name, rm.type, rm.building, rm.floor, rm.capacity,
              rm.air_conditioned, rm.has_computers, rm.computer_count,
              rm.description, rm.status, rm.college_id,
              c.code AS college_code, c.name AS college_name
       FROM rooms rm
       JOIN colleges c ON c.id = rm.college_id
       ORDER BY c.name, rm.type, rm.name`
    );

    res.render("rooms/index", { title: "Rooms & Laboratories", rooms });
  } catch (err) {
    next(err);
  }
});

module.exports = router;