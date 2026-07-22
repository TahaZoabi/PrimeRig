/**
 * controllers/activityController.js
 *
 * Recent Activity feed for the Admin Dashboard. Not period-scoped — it's a
 * live, global feed of the most recent admin/customer actions, independent
 * of the dashboard's date filter.
 */

const pool = require("../db");

/** GET /api/admin/activity  (admin) */
const getRecentActivity = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const [rows] = await pool.query(
      "SELECT id, type, message, created_at FROM activity_log ORDER BY created_at DESC LIMIT ?",
      [limit],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

module.exports = { getRecentActivity };
