/**
 * controllers/categoriesController.js
 *
 * CRUD operations for product categories.
 * Read is public; write is admin-only.
 */

const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

/** GET /api/categories */
const getCategories = async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM categories ORDER BY name");
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/** POST /api/categories  (admin) */
const createCategory = async (req, res, next) => {
  try {
    const { name, description, image_url } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const id = uuidv4();
    await pool.query(
      "INSERT INTO categories (id, name, description, image_url) VALUES (?, ?, ?, ?)",
      [id, name, description || null, image_url || null]
    );
    const [rows] = await pool.query("SELECT * FROM categories WHERE id = ?", [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
};

/** PUT /api/categories/:id  (admin) */
const updateCategory = async (req, res, next) => {
  try {
    const { name, description, image_url } = req.body;
    await pool.query(
      "UPDATE categories SET name = ?, description = ?, image_url = ? WHERE id = ?",
      [name, description || null, image_url || null, req.params.id]
    );
    res.json({ message: "Category updated" });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/categories/:id  (admin) */
const deleteCategory = async (req, res, next) => {
  try {
    await pool.query("DELETE FROM categories WHERE id = ?", [req.params.id]);
    res.json({ message: "Category deleted" });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
