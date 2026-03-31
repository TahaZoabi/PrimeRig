/**
 * controllers/authController.js
 *
 * Handles user registration, login, and profile operations.
 * Passwords are hashed with bcrypt.
 * Returns JWT on success.
 */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

/**
 * Generate a signed JWT for the given user
 */
const signToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

/**
 * POST /api/auth/register
 * Body: { email, password, full_name }
 */
const register = async (req, res, next) => {
  try {
    const { email, password, full_name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Check if email already exists
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    await pool.query(
      "INSERT INTO users (id, email, password, full_name) VALUES (?, ?, ?, ?)",
      [userId, email, hash, full_name || null]
    );

    // Create associated profile
    await pool.query(
      "INSERT INTO profiles (id, user_id, full_name) VALUES (?, ?, ?)",
      [uuidv4(), userId, full_name || null]
    );

    const user = { id: userId, email, role: "user", full_name: full_name || null };
    const token = signToken(user);

    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const [rows] = await pool.query(
      "SELECT id, email, password, role, full_name FROM users WHERE email = ?",
      [email]
    );
    if (!rows.length) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken(user);
    const { password: _pw, ...safeUser } = user;

    res.json({ token, user: safeUser });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 * Returns the authenticated user and their profile
 */
const getMe = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.role, u.full_name,
              p.phone, p.address
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/auth/profile
 * Body: { full_name, phone, address }
 */
const updateProfile = async (req, res, next) => {
  try {
    const { full_name, phone, address } = req.body;

    await pool.query(
      "UPDATE users SET full_name = ? WHERE id = ?",
      [full_name || null, req.user.id]
    );

    // Upsert profile
    await pool.query(
      `INSERT INTO profiles (id, user_id, full_name, phone, address)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), phone = VALUES(phone), address = VALUES(address)`,
      [uuidv4(), req.user.id, full_name || null, phone || null, address || null]
    );

    res.json({ message: "Profile updated" });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getMe, updateProfile };
