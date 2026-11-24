// Check-in / check-out rules, shared by the admin buttons and the QR-code scan page,
// so both paths enforce exactly the same conditions.
const { nowParts, toMinutes } = require("./time");
const { writeAudit } = require("./audit");
const { emailUsers } = require("./mailer");

const CHECKIN_EARLY_MINUTES = 15;

// Loads (and row-locks) a reservation inside a transaction.
// Pass collegeId from admin routes: a reservation for another college's facility is then
// treated as "not found", exactly like one that does not exist.
async function loadForAttendance(connection, id, collegeId = null) {
  const [rows] = await connection.execute(`
    SELECT r.id, r.room_id, r.reference_no, r.user_id, r.status, r.checked_in_at, r.checked_out_at,
           DATE_FORMAT(r.reservation_date, '%Y-%m-%d') AS d,
           TIME_FORMAT(r.start_time, '%H:%i:%s') AS st,
           TIME_FORMAT(r.end_time, '%H:%i:%s') AS et,
           rm.name AS room_name, rm.college_id
    FROM reservations r JOIN rooms rm ON rm.id = r.room_id
    WHERE r.id = ? ${collegeId === null ? "" : "AND rm.college_id = ?"}
    LIMIT 1 FOR UPDATE
  `, collegeId === null ? [id] : [id, collegeId]);
  return rows[0];
}

// Returns a message explaining why check-in is not allowed, or null if it is.
function checkInProblem(r, now = nowParts()) {
  if (r.status !== "Approved") return "Only approved reservations can be checked in.";
  if (r.checked_in_at) return "This reservation is already checked in.";
  if (r.d !== now.date) return `Check-in is only available on the reservation date (${r.d}).`;
  const nowMin = toMinutes(now.time);
  if (nowMin < toMinutes(r.st) - CHECKIN_EARLY_MINUTES) {
    return `Check-in opens ${CHECKIN_EARLY_MINUTES} minutes before the start time (${r.st.slice(0, 5)}).`;
  }
  if (nowMin >= toMinutes(r.et)) return "The scheduled time has already ended, so check-in is closed.";
  return null;
}

// Check-out is allowed any time after check-in (people may leave early or late).
function checkOutProblem(r) {
  if (r.status !== "Approved") return "Only approved reservations can be checked out.";
  if (!r.checked_in_at) return "Check the group in before checking out.";
  if (r.checked_out_at) return "This reservation is already checked out.";
  return null;
}

// Times are stored as school-local wall-clock time so they read the same on any host.
async function applyCheckIn(connection, r, { userId, req, via }) {
  const now = nowParts();
  await connection.execute("UPDATE reservations SET checked_in_at = ? WHERE id = ?", [`${now.date} ${now.time}`, r.id]);
  await writeAudit(connection, { userId, action: "CHECK_IN", entityType: "reservation", entityId: r.id, details: `Checked in ${r.reference_no}${via === "qr" ? " via QR code" : ""}`, req, collegeId: r.college_id });
}

async function applyCheckOut(connection, r, { userId, req, via }) {
  const now = nowParts();
  await connection.execute("UPDATE reservations SET status = 'Completed', checked_out_at = ? WHERE id = ?", [`${now.date} ${now.time}`, r.id]);
  await writeAudit(connection, { userId, action: "CHECK_OUT", entityType: "reservation", entityId: r.id, details: `Checked out and completed ${r.reference_no}${via === "qr" ? " via QR code" : ""}`, req, collegeId: r.college_id });
  await connection.execute("INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)", [r.user_id, "Reservation Completed", `Your reservation ${r.reference_no} for ${r.room_name} has been marked completed.`]);
}

// Call AFTER the transaction commits; never throws.
function emailCheckOut(db, r) {
  emailUsers(db, [r.user_id], {
    subject: `Reservation ${r.reference_no} completed`,
    heading: "Your reservation was marked completed",
    lines: [`Reservation ${r.reference_no} for ${r.room_name} has been marked completed.`],
    linkPath: `/reservations/${r.id}`
  });
}

module.exports = { CHECKIN_EARLY_MINUTES, loadForAttendance, checkInProblem, checkOutProblem, applyCheckIn, applyCheckOut, emailCheckOut };
