/**
 * controllers/categoriesController.js
 *
 * CRUD operations for product categories.
 * Public read returns active categories only; admins can see and manage all
 * of them (including archived ones) via the /admin/categories endpoint.
 *
 * Categories are never hard-deleted. "Delete" archives a category
 * (is_active = 0, archived_at = now) instead of removing the row, so
 * products and orders that reference it keep working. Admins can restore
 * it later, which clears archived_at again.
 */

const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

/** GET /api/categories  (public — active only) */
const getCategories = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM categories WHERE is_active = 1 ORDER BY name",
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/** GET /api/admin/categories  (admin — includes archived categories) */
const getAdminCategories = async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM categories ORDER BY name");
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/**
 * Is there already a category with this name, ignoring case and
 * leading/trailing whitespace ("GPU", "gpu", " GPU " all collide)?
 * Checks archived categories too, so you can't re-create a duplicate of
 * one that's just hidden. excludeId lets an update check among *other* rows.
 */
const findDuplicateCategory = async (name, excludeId) => {
  const [rows] = await pool.query(
    `SELECT id FROM categories
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
     ${excludeId ? "AND id != ?" : ""}`,
    excludeId ? [name, excludeId] : [name],
  );
  return rows.length > 0;
};

/** POST /api/categories  (admin) */
const createCategory = async (req, res, next) => {
  try {
    const { name, description, image_url } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    if (await findDuplicateCategory(name)) {
      return res
        .status(409)
        .json({ error: `A category named "${name.trim()}" already exists` });
    }

    const id = uuidv4();
    await pool.query(
      "INSERT INTO categories (id, name, description, image_url) VALUES (?, ?, ?, ?)",
      [id, name, description || null, image_url || null],
    );
    const [rows] = await pool.query("SELECT * FROM categories WHERE id = ?", [
      id,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
};

/** PUT /api/categories/:id  (admin) */
const updateCategory = async (req, res, next) => {
  try {
    const { name, description, image_url } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    if (await findDuplicateCategory(name, req.params.id)) {
      return res
        .status(409)
        .json({ error: `A category named "${name.trim()}" already exists` });
    }

    await pool.query(
      "UPDATE categories SET name = ?, description = ?, image_url = ? WHERE id = ?",
      [name, description || null, image_url || null, req.params.id],
    );
    res.json({ message: "Category updated" });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/categories/:id  (admin)
 * Archives the category (is_active = 0, archived_at = now) instead of
 * removing the row, so products/orders referencing it keep working.
 */
const deleteCategory = async (req, res, next) => {
  try {
    await pool.query(
      "UPDATE categories SET is_active = 0, archived_at = NOW() WHERE id = ?",
      [req.params.id],
    );
    res.json({ message: "Category archived" });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/admin/categories/:id/restore  (admin) — bring back an archived category */
const restoreCategory = async (req, res, next) => {
  try {
    await pool.query(
      "UPDATE categories SET is_active = 1, archived_at = NULL WHERE id = ?",
      [req.params.id],
    );
    res.json({ message: "Category restored" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCategories,
  getAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  restoreCategory,
};
