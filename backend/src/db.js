/**
 * db.js - MySQL connection pool
 *
 * Uses mysql2/promise for async/await support.
 * The pool is shared across the entire application.
 */

const mysql = require("mysql2/promise");
require("dotenv").config();

// Create a connection pool (max 10 connections by default)
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pimerig",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Return JS Date objects instead of strings
  dateStrings: false,
  // Parse JSON columns automatically
  typeCast: function (field, next) {
    if (field.type === "JSON") {
      const val = field.string();
      return val ? JSON.parse(val) : null;
    }
    return next();
  },
});

// Test the connection on startup
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
