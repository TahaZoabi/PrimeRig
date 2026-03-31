/**
 * controllers/suppliersController.js
 *
 * CRUD for suppliers. Public read; admin write.
 */

const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

const getSuppliers = async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM suppliers ORDER BY name");
    res.json(rows);
  } catch (err) { next(err); }
};

const createSupplier = async (req, res, next) => {
  try {
    const { name, contact_email, specialization } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const id = uuidv4();
    await pool.query(
      "INSERT INTO suppliers (id, name, contact_email, specialization) VALUES (?, ?, ?, ?)",
      [id, name, contact_email || null, specialization || null]
    );
    const [rows] = await pool.query("SELECT * FROM suppliers WHERE id = ?", [id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

const updateSupplier = async (req, res, next) => {
  try {
    const { name, contact_email, specialization } = req.body;
    await pool.query(
      "UPDATE suppliers SET name = ?, contact_email = ?, specialization = ? WHERE id = ?",
      [name, contact_email || null, specialization || null, req.params.id]
    );
    res.json({ message: "Supplier updated" });
  } catch (err) { next(err); }
};

const deleteSupplier = async (req, res, next) => {
  try {
    await pool.query("DELETE FROM suppliers WHERE id = ?", [req.params.id]);
    res.json({ message: "Supplier deleted" });
  } catch (err) { next(err); }
};

module.exports = { getSuppliers, createSupplier, updateSupplier, deleteSupplier };
