/**
 * middleware/auth.js
 *
 * JWT authentication middleware.
 * Verifies the Bearer token from the Authorization header,
 * attaches the decoded user payload to req.user.
 */

const jwt = require("jsonwebtoken");
const pool = require("../db");

/**
 * authenticate - required auth, returns 401 if not valid
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Optionally verify user still exists in DB
    const [rows] = await pool.query(
      "SELECT id, email, role, full_name FROM users WHERE id = ?",
      [decoded.id]
    );
    if (!rows.length) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = rows[0]; // { id, email, role, full_name }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

/**
 * optionalAuth - attaches req.user if token present, continues either way
 * Used for routes that behave differently for logged-in vs guest users
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const [rows] = await pool.query(
        "SELECT id, email, role, full_name FROM users WHERE id = ?",
        [decoded.id]
      );
      if (rows.length) req.user = rows[0];
    }
  } catch (_) {
    // ignore - no user
  }
  next();
};

/**
 * requireAdmin - must be called after authenticate
 * Checks if req.user has admin role
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

module.exports = { authenticate, optionalAuth, requireAdmin };
