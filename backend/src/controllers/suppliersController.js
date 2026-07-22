/**
 * controllers/suppliersController.js
 *
 * CRUD for suppliers. Public read returns active suppliers only; admins can
 * see and manage all of them (including archived) via /admin/suppliers.
 *
 * Suppliers are never hard-deleted. "Delete" archives a supplier
 * (is_active = 0, archived_at = now) instead of removing the row, so
 * products linked to it keep working. Admins can restore it later.
 * Duplicate names (ignoring case/whitespace) are rejected before insert.
 */

const { v4: uuidv4 } = require("uuid");
const pool = require("../db");
const { logActivity } = require("../utils/activityLog");

/** GET /api/suppliers  (public — active only) */
const getSuppliers = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name",
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/** GET /api/admin/suppliers  (admin — includes archived suppliers) */
const getAdminSuppliers = async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM suppliers ORDER BY name");
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/**
 * Is there already a supplier with this name, ignoring case and
 * leading/trailing whitespace? Checks archived suppliers too. excludeId
 * lets an update check among *other* rows only.
 */
const findDuplicateSupplier = async (name, excludeId) => {
  const [rows] = await pool.query(
    `SELECT id FROM suppliers
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
     ${excludeId ? "AND id != ?" : ""}`,
    excludeId ? [name, excludeId] : [name],
  );
  return rows.length > 0;
};

const createSupplier = async (req, res, next) => {
  try {
    const { name, contact_email, specialization } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    if (await findDuplicateSupplier(name)) {
      return res
        .status(409)
        .json({ error: `A supplier named "${name.trim()}" already exists` });
    }

    const id = uuidv4();
    await pool.query(
      "INSERT INTO suppliers (id, name, contact_email, specialization) VALUES (?, ?, ?, ?)",
      [id, name, contact_email || null, specialization || null],
    );
    const [rows] = await pool.query("SELECT * FROM suppliers WHERE id = ?", [
      id,
    ]);
    logActivity("supplier", `Supplier "${name.trim()}" was added`);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const updateSupplier = async (req, res, next) => {
  try {
    const { name, contact_email, specialization } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    if (await findDuplicateSupplier(name, req.params.id)) {
      return res
        .status(409)
        .json({ error: `A supplier named "${name.trim()}" already exists` });
    }

    await pool.query(
      "UPDATE suppliers SET name = ?, contact_email = ?, specialization = ? WHERE id = ?",
      [name, contact_email || null, specialization || null, req.params.id],
    );
    res.json({ message: "Supplier updated" });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/suppliers/:id  (admin)
 * Archives the supplier (is_active = 0, archived_at = now) instead of
 * removing the row, so products linked to it keep working.
 */
const deleteSupplier = async (req, res, next) => {
  try {
    const [[sup]] = await pool.query(
      "SELECT name FROM suppliers WHERE id = ?",
      [req.params.id],
    );
    await pool.query(
      "UPDATE suppliers SET is_active = 0, archived_at = NOW() WHERE id = ?",
      [req.params.id],
    );
    if (sup) logActivity("supplier", `Supplier "${sup.name}" was archived`);
    res.json({ message: "Supplier archived" });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/admin/suppliers/:id/restore  (admin) — bring back an archived supplier */
const restoreSupplier = async (req, res, next) => {
  try {
    const [[sup]] = await pool.query(
      "SELECT name FROM suppliers WHERE id = ?",
      [req.params.id],
    );
    await pool.query(
      "UPDATE suppliers SET is_active = 1, archived_at = NULL WHERE id = ?",
      [req.params.id],
    );
    if (sup) logActivity("supplier", `Supplier "${sup.name}" was restored`);
    res.json({ message: "Supplier restored" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSuppliers,
  getAdminSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  restoreSupplier,
};
