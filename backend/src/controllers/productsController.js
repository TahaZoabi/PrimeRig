/**
 * controllers/productsController.js
 *
 * Handles product CRUD operations.
 * Public: list, single product.
 * Admin-only: create, update, delete.
 */

const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

/**
 * GET /api/products
 * Query params: search, categoryId, sortBy, minPrice, maxPrice
 */
const getProducts = async (req, res, next) => {
  try {
    const { search, categoryId, sortBy, minPrice, maxPrice } = req.query;

    let sql = `
      SELECT p.*, c.name AS category_name, s.name AS supplier_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers  s ON s.id = p.supplier_id
      WHERE p.is_active = 1
    `;
    const params = [];

    if (categoryId) {
      sql += " AND p.category_id = ?";
      params.push(categoryId);
    }
    if (minPrice) {
      sql += " AND p.price >= ?";
      params.push(Number(minPrice));
    }
    if (maxPrice) {
      sql += " AND p.price <= ?";
      params.push(Number(maxPrice));
    }
    if (search) {
      sql += " AND (p.name LIKE ? OR c.name LIKE ?)";
      const like = `%${search}%`;
      params.push(like, like);
    }

    // Sorting
    switch (sortBy) {
      case "price_asc":  sql += " ORDER BY p.price ASC";        break;
      case "price_desc": sql += " ORDER BY p.price DESC";       break;
      case "name":       sql += " ORDER BY p.name ASC";         break;
      default:           sql += " ORDER BY p.created_at DESC";  break;
    }

    const [rows] = await pool.query(sql, params);

    // Reshape to match frontend expectations: { categories: { name }, suppliers: { name } }
    const products = rows.map(shapeProduct);
    res.json(products);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/products/builder
 * Returns all active, in-stock products with their category names
 * Used by the PC Builder page
 */
const getBuilderProducts = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1 AND p.stock > 0
      ORDER BY p.name
    `);
    res.json(rows.map(shapeProduct));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/products/:id
 */
const getProduct = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Product not found" });
    res.json(shapeProduct(rows[0]));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/products  (admin)
 */
const createProduct = async (req, res, next) => {
  try {
    const {
      name, description, price, stock, image_url,
      category_id, supplier_id, specs,
      socket_type, ddr_type, wattage, form_factor,
    } = req.body;

    if (!name) return res.status(400).json({ error: "Name is required" });

    const id = uuidv4();
    await pool.query(
      `INSERT INTO products
         (id, name, description, price, stock, image_url, category_id, supplier_id,
          specs, socket_type, ddr_type, wattage, form_factor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        description || null,
        Number(price) || 0,
        Number(stock) || 0,
        image_url || null,
        category_id || null,
        supplier_id || null,
        specs ? JSON.stringify(specs) : null,
        socket_type || null,
        ddr_type || null,
        Number(wattage) || 0,
        form_factor || null,
      ]
    );

    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       WHERE p.id = ?`,
      [id]
    );
    res.status(201).json(shapeProduct(rows[0]));
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/products/:id  (admin)
 */
const updateProduct = async (req, res, next) => {
  try {
    const {
      name, description, price, stock, image_url,
      category_id, supplier_id, specs,
      socket_type, ddr_type, wattage, form_factor, is_active,
    } = req.body;

    await pool.query(
      `UPDATE products SET
         name        = ?,
         description = ?,
         price       = ?,
         stock       = ?,
         image_url   = ?,
         category_id = ?,
         supplier_id = ?,
         specs       = ?,
         socket_type = ?,
         ddr_type    = ?,
         wattage     = ?,
         form_factor = ?,
         is_active   = ?
       WHERE id = ?`,
      [
        name,
        description || null,
        Number(price) || 0,
        Number(stock) || 0,
        image_url || null,
        category_id || null,
        supplier_id || null,
        specs ? JSON.stringify(specs) : null,
        socket_type || null,
        ddr_type || null,
        Number(wattage) || 0,
        form_factor || null,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        req.params.id,
      ]
    );
    res.json({ message: "Product updated" });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/products/:id  (admin)
 */
const deleteProduct = async (req, res, next) => {
  try {
    await pool.query("DELETE FROM products WHERE id = ?", [req.params.id]);
    res.json({ message: "Product deleted" });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/products/admin/all  (admin - returns all including inactive)
 */
const getAdminProducts = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       ORDER BY p.created_at DESC`
    );
    res.json(rows.map(shapeProduct));
  } catch (err) {
    next(err);
  }
};

/**
 * Helper: reshape flat SQL row into nested object matching frontend shape.
 * MySQL returns DECIMAL/FLOAT columns as strings — cast them to JS numbers here
 * so the frontend can safely call .toFixed(), do arithmetic, etc.
 */
function shapeProduct(row) {
  const { category_name, supplier_name, ...rest } = row;

  // Parse specs — may arrive as a raw JSON string if typeCast missed it
  let specs = rest.specs;
  if (typeof specs === "string") {
    try { specs = JSON.parse(specs); } catch { specs = null; }
  }

  return {
    ...rest,
    price:     parseFloat(rest.price)    || 0,
    stock:     parseInt(rest.stock, 10)  || 0,
    wattage:   parseInt(rest.wattage, 10) || 0,
    is_active: Boolean(rest.is_active),
    specs,
    categories: category_name ? { name: category_name } : null,
    suppliers:  supplier_name ? { name: supplier_name } : null,
  };
}

module.exports = {
  getProducts,
  getBuilderProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getAdminProducts,
};
