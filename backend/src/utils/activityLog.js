/**
 * utils/activityLog.js
 *
 * Shared helper for recording admin/customer actions to the activity_log
 * table, powering the Admin Dashboard's "Recent Activity" panel.
 *
 * Deliberately fire-and-forget: a logging failure must never break the
 * actual operation (creating an order, archiving a product, etc.), so
 * every call is wrapped in its own try/catch and only logged to the
 * server console on failure.
 */

const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

/**
 * @param {string} type    short machine tag, e.g. "order", "product", "category", "supplier"
 * @param {string} message human-readable sentence, e.g. 'Customer jane@test.com placed order #a1b2c3d4'
 */
async function logActivity(type, message) {
  try {
    await pool.query(
      "INSERT INTO activity_log (id, type, message) VALUES (?, ?, ?)",
      [uuidv4(), type, message],
    );
  } catch (err) {
    // Never let activity logging take down the real request.
    console.error("Failed to write activity log:", err.message);
  }
}

module.exports = { logActivity };
