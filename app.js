require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const expressLayouts = require("express-ejs-layouts");
const MySQLStore = require("express-mysql-session")(session);

const authRoutes = require("./routes/auth");
const adminDashboardRoutes = require("./routes/adminDashboard");
const systemAdminRoutes = require("./routes/systemAdmin");
const dashboardRoutes = require("./routes/dashboard");
const roomRoutes = require("./routes/rooms");
const reservationRoutes = require("./routes/reservations");
const adminRoutes = require("./routes/admin");
const notificationRoutes = require("./routes/notifications");
const calendarRoutes = require("./routes/calendar");
const checkinRoutes = require("./routes/checkin");
const profileRoutes = require("./routes/profile");
const db = require("./config/db");
const { csrfProtection } = require("./middleware/csrf");
const { ensureRoomTokens } = require("./utils/roomTokens");
const { nowParts, todayStr } = require("./utils/time");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

// Template helpers: always show school-local time (Asia/Manila by default), whatever
// time zone the hosting server runs in.
const APP_TZ = process.env.APP_TIMEZONE || "Asia/Manila";
app.locals.todayStr = () => todayStr();
app.locals.formatDay = (value) => (value ? nowParts(new Date(value)).date : "—");
app.locals.formatDateTime = (value) => (value
  ? new Date(value).toLocaleString("en-PH", { timeZone: APP_TZ, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
  : "—");

// The host's load balancer terminates TLS and forwards requests to Node over HTTP.
// Trusting one proxy hop makes req.secure, req.protocol and req.ip reflect the real
// visitor. Without this, Secure session cookies are never set and the IP-based
// rate limiters see every visitor as the same address.
if (isProduction) app.set("trust proxy", 1);

if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error("Production requires a SESSION_SECRET of at least 32 characters.");
}

async function ensureAccountSchema() {
  // Schema changes should normally be applied by a DBA/deployment step, not by
  // the application's least-privileged database account. Set AUTO_MIGRATE=true
  // only for local development when the DB user is allowed to alter the schema.
  if (process.env.AUTO_MIGRATE !== "true") return;

  await db.execute(`ALTER TABLE users
    ADD COLUMN IF NOT EXISTS program VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS year_level VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS section VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS department VARCHAR(150) NULL,
    ADD COLUMN IF NOT EXISTS position VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS terms_accepted_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.query(`ALTER TABLE reservations
    ADD COLUMN IF NOT EXISTS checked_in_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS checked_out_at DATETIME NULL`);
  await db.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS checkin_token VARCHAR(64) NULL`);
  try { await db.query(`ALTER TABLE rooms ADD UNIQUE KEY uq_room_checkin_token (checkin_token)`); } catch (e) { if (e.code !== "ER_DUP_KEYNAME") throw e; }

  await db.execute(`CREATE TABLE IF NOT EXISTS user_settings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,
    email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    reservation_updates BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS facility_maintenance (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id INT UNSIGNED NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(255) NOT NULL,
    status ENUM('Scheduled','Completed','Cancelled') NOT NULL DEFAULT 'Scheduled',
    created_by INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_maintenance_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_maintenance_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_maintenance_room_dates (room_id, start_date, end_date, status),
    INDEX idx_maintenance_dates (start_date, end_date, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Multi-college support. Dev convenience only; the full migration (with foreign keys) is
  // database/migrations/20261124_colleges.sql. Everything that exists today becomes CCS.
  await db.execute(`CREATE TABLE IF NOT EXISTS colleges (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.execute(`INSERT IGNORE INTO colleges (code, name) VALUES
    ('CCS', 'College of Computer Studies'),
    ('CTHBM', 'College of Tourism, Hospitality and Business Management'),
    ('CAS', 'College of Arts and Sciences'),
    ('CEA', 'College of Engineering and Architecture'),
    ('CHS', 'College of Health Sciences')`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS college_id INT UNSIGNED NULL`);
  await db.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS college_id INT UNSIGNED NULL`);
  const [[ccs]] = await db.execute(`SELECT id FROM colleges WHERE code = 'CCS' LIMIT 1`);
  for (const table of ["users", "rooms"]) {
    await db.execute(`UPDATE ${table} SET college_id = ? WHERE college_id IS NULL`, [ccs.id]);
  }
  await db.query(`ALTER TABLE rooms MODIFY college_id INT UNSIGNED NOT NULL`);
  try { await db.query(`ALTER TABLE rooms ADD UNIQUE KEY uq_room_college_name (college_id, name)`); } catch (e) { if (e.code !== "ER_DUP_KEYNAME") throw e; }
  try { await db.query(`ALTER TABLE rooms DROP INDEX name`); } catch (e) { if (e.code !== "ER_CANT_DROP_FIELD_OR_KEY") throw e; }

  await db.execute(`CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(64) NULL,
    details TEXT NULL,
    ip_address VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_audit_created (created_at),
    INDEX idx_audit_user (user_id, created_at),
    INDEX idx_audit_entity (entity_type, entity_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // audit_logs is created just above on a fresh database, so tag it with colleges last.
  await db.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS college_id INT UNSIGNED NULL`);
  await db.execute(`UPDATE audit_logs SET college_id = ? WHERE college_id IS NULL`, [ccs.id]);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layouts/main");

app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(express.json({ limit: "100kb" }));

// Baseline browser protections. These do not replace authorization or input validation.
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera(self), microphone=(), geolocation=()");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

// Health check for the hosting platform. Placed before the session middleware so
// monitoring pings never create session rows. Reveals no internal details.
app.get("/healthz", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    await db.query("SELECT 1");
    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Health check failed:", err.code || err.message);
    res.status(503).json({ status: "unavailable" });
  }
});

// Sessions live in MySQL so they survive redeploys and restarts. The store reuses
// the app's pool (the callback API underneath the promise pool). The `sessions`
// table is created by database/deploy-setup.sql, because the least-privilege DB
// user cannot run CREATE TABLE.
const sessionStore = new MySQLStore(
  {
    createDatabaseTable: false,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 1000 * 60 * 60 * 8
  },
  db.pool
);

app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "development-secret",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use(flash());
app.use(async (req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.unreadNotifications = 0;

  if (req.session.user) {
    try {
      const [[row]] = await db.execute(
        `SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = FALSE`,
        [req.session.user.id]
      );
      res.locals.unreadNotifications = Number(row.unread || 0);
    } catch (err) {
      // Notification count should never prevent the rest of the application from loading.
      console.error("Notification count error:", err.message);
    }
  }
  next();
});

app.use(csrfProtection);

// An account whose password was reset by an administrator must choose a new one
// before using anything else.
app.use((req, res, next) => {
  const u = req.session.user;
  if (!u || !u.must_change_password) return next();
  const allowed =
    (req.method === "GET" && req.path === "/security") ||
    (req.method === "POST" && (req.path === "/security/password" || req.path === "/logout"));
  if (allowed) return next();
  req.flash("error", "Please change your temporary password to continue.");
  return res.redirect("/security");
});

app.get("/", async (req, res, next) => {
  if (req.session.user) return res.redirect("/dashboard");
  try {
    const [rooms] = await db.execute(
      `SELECT CONCAT(c.code, ' · ', rm.name) AS name, rm.type, rm.capacity
       FROM rooms rm JOIN colleges c ON c.id = rm.college_id
       WHERE rm.status = 'Available' ORDER BY rm.type, c.code, rm.name LIMIT 4`
    );
    res.render("landing", { title: "CSPC SpaceHub", rooms, isLanding: true });
  } catch (err) {
    next(err);
  }
});

app.use("/", authRoutes);
app.use((req, res, next) => {
  if (req.path === "/system-admin") {
    console.log("[APP ROUTER CHECK]", req.method, req.originalUrl);
  }
  next();
});
app.use("/", systemAdminRoutes);
app.use("/", adminDashboardRoutes); // college-scoped admin dashboard; non-admins fall through
app.use("/", dashboardRoutes);
app.use("/rooms", roomRoutes);
app.use("/reservations", reservationRoutes);
app.use("/calendar", calendarRoutes);
app.use("/checkin", checkinRoutes);
app.use("/", notificationRoutes);
app.use("/admin", adminRoutes);
app.use("/", profileRoutes);

app.use((req, res) => {
  res.status(404).render("errors/404", { title: "Page Not Found" });
});

function describeError(err) {
  const isConnectionError =
    err && (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "PROTOCOL_CONNECTION_LOST" ||
            (typeof AggregateError !== "undefined" && err instanceof AggregateError));
  if (isConnectionError) {
    return "The database could not be reached. Make sure MySQL is running, then refresh this page.";
  }
  if (err && err.code === "ER_NO_SUCH_TABLE") {
    return "A database table is missing. Run database/schema.sql and the files in database/migrations.";
  }
  return (err && (err.message || err.code)) || "An unexpected error occurred.";
}

app.use((err, req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    console.error("Unhandled application error:", err && (err.message || err.code));
  } else {
    console.error(err);
  }
  res.status(500).render("errors/500", {
    title: "Server Error",
    message: process.env.NODE_ENV === "production"
      ? "Something went wrong."
      : describeError(err)
  });
});

ensureAccountSchema()
  .then(async () => {
    try {
      const made = await ensureRoomTokens(db);
      if (made) console.log(`Created QR check-in codes for ${made} facilit${made === 1 ? "y" : "ies"}.`);
    } catch (err) {
      console.error("Could not prepare QR codes (has the room_qr_tokens migration been run?):", err.code || err.message);
    }
    app.listen(PORT, () => {
      console.log(`CSPC SpaceHub listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database setup error:", err.message);
    process.exit(1);
  });