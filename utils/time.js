// School-local wall-clock time, independent of the server's own time zone
// (hosting platforms usually run in UTC). Default Asia/Manila; override with APP_TIMEZONE.
function nowParts(at = new Date(), tz = process.env.APP_TIMEZONE || "Asia/Manila") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(at);
  const g = (t) => parts.find((p) => p.type === t).value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}:${g("second")}` };
}

function toMinutes(hhmmss) {
  const [h, m] = String(hhmmss).split(":").map(Number);
  return h * 60 + m;
}

function todayStr(at = new Date()) {
  return nowParts(at).date;
}

// DATE columns arrive as "YYYY-MM-DD" strings (see config/db.js); a Date object is
// also accepted and read with local getters.
function dateKey(value) {
  if (value instanceof Date) {
    const p = (n) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

// Has a reservation's start time already passed, in school-local time?
function hasStarted(dateValue, startTime, at = new Date()) {
  const now = nowParts(at);
  const start = `${dateKey(dateValue)} ${String(startTime || "00:00").slice(0, 5)}:00`;
  return start <= `${now.date} ${now.time}`;
}

module.exports = { nowParts, toMinutes, todayStr, dateKey, hasStarted };
