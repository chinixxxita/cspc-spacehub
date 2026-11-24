const mysql = require("mysql2/promise");

const isProduction = process.env.NODE_ENV === "production";

if (isProduction && (!process.env.DB_USER || process.env.DB_USER === "root")) {
  throw new Error("Production requires a dedicated non-root DB_USER.");
}

// TLS is always on in production. For local development set DB_SSL=true to enable it.
const sslEnabled = isProduction || process.env.DB_SSL === "true";
// Some providers (for example Aiven) give you a CA certificate. Paste it into DB_CA;
// literal \n sequences are converted to real newlines.
const caCert = process.env.DB_CA ? process.env.DB_CA.replace(/\\n/g, "\n") : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: "utf8mb4",
  multipleStatements: false,
  enableKeepAlive: true,
  connectTimeout: 10000,
  // Timezone-proof dates: DATE columns come back as "YYYY-MM-DD" text (no JS Date, so
  // no shifting by the server's zone); everything else is read/written in UTC.
  dateStrings: ["DATE"],
  timezone: "Z",
  ...(sslEnabled ? {
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
      ...(caCert ? { ca: caCert } : {})
    }
  } : {})
});

// Make the database session use UTC too, so TIMESTAMP columns (created_at, ...) mean
// the same thing no matter where the database or the app server runs.
pool.pool.on("connection", (conn) => {
  conn.query("SET time_zone = '+00:00'", (err) => {
    if (err) console.error("Could not set DB session time zone:", err.code || err.message);
  });
});

// Note: the promise pool exposes the underlying callback pool as `pool.pool`,
// which app.js hands to the session store.
module.exports = pool;
