const crypto = require("crypto");

// 128-bit random token embedded in each facility's QR code (/checkin/<token>).
const newToken = () => crypto.randomBytes(16).toString("hex");

// Gives every facility that has no token yet one. Safe to call repeatedly.
async function ensureRoomTokens(db) {
  const [rows] = await db.execute("SELECT id FROM rooms WHERE checkin_token IS NULL");
  for (const r of rows) {
    await db.execute("UPDATE rooms SET checkin_token = ? WHERE id = ? AND checkin_token IS NULL", [newToken(), r.id]);
  }
  return rows.length;
}

module.exports = { newToken, ensureRoomTokens };
