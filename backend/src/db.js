/**
 * db.js - MySQL connection pool
 *
 * Uses mysql2/promise for async/await support.
 * The pool is shared across the entire application.
 */

const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pimerig",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: false,
  // mysql2 reports JSON columns as type "BLOB", not "JSON".
  // We match by column NAME instead so "specs" is always parsed correctly.
  typeCast: function (field, next) {
    if (field.name === "specs") {
      const val = field.string();
      if (!val) return null;
      try { return JSON.parse(val); } catch { return null; }
    }
    return next();
  },
});

pool
  .getConnection()
  .then((conn) => {
    console.log("✅ MySQL connected successfully");
    conn.release();
  })
  .catch((err) => {
    console.error("❌ MySQL connection failed:", err.message);
    process.exit(1);
  });

module.exports = pool;
