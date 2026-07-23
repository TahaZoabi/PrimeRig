/**
 * controllers/productsController.js
 *
 * Handles product CRUD operations.
 * Public: list, single product.
 * Admin-only: create, update, delete.
 */

const { v4: uuidv4 } = require("uuid");
const pool = require("../db");
const { logActivity } = require("../utils/activityLog");

/**
 * Normalize a product name for duplicate comparison: trims leading/trailing
 * whitespace, collapses repeated internal spaces to one, and lowercases.
 * "RTX 4070", "rtx 4070", "  RTX   4070  " all normalize identically.
 */
const normalizeProductName = (s) =>
  String(s).trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Find an existing product with the same name in the same category
 * (case/whitespace-insensitive). This is the catalog's "same product"
 * identity: a supplier is where you source restocks from, not part of what
 * makes a catalog entry distinct — two supplier records for the same named
 * item in the same category is a restock scenario, not two products.
 * excludeId lets an update check for duplicates among *other* rows only.
 * Returns the matching row (including archived ones) or null.
 */
const findDuplicateProduct = async (name, categoryId, excludeId) => {
  const [rows] = await pool.query(
    `SELECT id, name, stock, is_active FROM products
     WHERE category_id = ? ${excludeId ? "AND id != ?" : ""}`,
    excludeId ? [categoryId, excludeId] : [categoryId],
  );
  const target = normalizeProductName(name);
  return rows.find((p) => normalizeProductName(p.name) === target) || null;
};

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
      case "price_asc":
        sql += " ORDER BY p.price ASC";
        break;
      case "price_desc":
        sql += " ORDER BY p.price DESC";
        break;
      case "name":
        sql += " ORDER BY p.name ASC";
        break;
      default:
        sql += " ORDER BY p.created_at DESC";
        break;
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
      [req.params.id],
    );
    if (!rows.length)
      return res.status(404).json({ error: "Product not found" });
    res.json(shapeProduct(rows[0]));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/products  (admin)
 * Body may include confirmStockIncreaseFor: <productId> — set only when the
 * admin has already been shown the "this product exists, increase stock
 * instead?" prompt and confirmed it. In that case this adds `stock` to the
 * existing product instead of creating a new row.
 */
const createProduct = async (req, res, next) => {
  try {
    const {
      name,
      description,
      price,
      stock,
      image_url,
      category_id,
      supplier_id,
      specs,
      socket_type,
      ddr_type,
      wattage,
      form_factor,
      confirmStockIncreaseFor,
    } = req.body;

    // ---- Required fields ----
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Product name is required" });
    }
    if (!category_id) {
      return res.status(400).json({ error: "Category is required" });
    }
    if (!supplier_id) {
      return res.status(400).json({ error: "Supplier is required" });
    }

    // ---- Referenced IDs must actually exist ----
    const [[category]] = await pool.query(
      "SELECT id FROM categories WHERE id = ?",
      [category_id],
    );
    if (!category) {
      return res
        .status(400)
        .json({ error: "Selected category does not exist" });
    }
    const [[supplier]] = await pool.query(
      "SELECT id FROM suppliers WHERE id = ?",
      [supplier_id],
    );
    if (!supplier) {
      return res
        .status(400)
        .json({ error: "Selected supplier does not exist" });
    }

    // ---- Admin already confirmed "increase stock instead" for a specific product ----
    if (confirmStockIncreaseFor) {
      const [[existing]] = await pool.query(
        "SELECT id, name, stock FROM products WHERE id = ?",
        [confirmStockIncreaseFor],
      );
      if (!existing) {
        return res.status(404).json({
          error: "The product you're trying to restock no longer exists",
        });
      }
      const addQty = Number(stock) || 0;
      const previousStock = existing.stock;
      const newStock = previousStock + addQty;

      await pool.query("UPDATE products SET stock = ? WHERE id = ?", [
        newStock,
        existing.id,
      ]);
      logActivity(
        "product",
        `Stock for "${existing.name}" increased from ${previousStock} to ${newStock}`,
      );

      return res.json({
        merged: true,
        message: `Existing product stock increased from ${previousStock} to ${newStock}.`,
        productId: existing.id,
        previousStock,
        newStock,
      });
    }

    // ---- Duplicate detection: same name + same category ----
    const duplicate = await findDuplicateProduct(name, category_id);
    if (duplicate) {
      if (!duplicate.is_active) {
        return res.status(409).json({
          error: `A product named "${duplicate.name}" already exists in this category but is archived. Restore it from the Archived tab instead of creating a new one.`,
        });
      }
      return res.status(409).json({
        error: `A product named "${duplicate.name}" already exists in this category.`,
        duplicate: {
          id: duplicate.id,
          name: duplicate.name,
          stock: duplicate.stock,
        },
      });
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO products
         (id, name, description, price, stock, image_url, category_id, supplier_id,
          specs, socket_type, ddr_type, wattage, form_factor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name.trim(),
        description || null,
        Number(price) || 0,
        Number(stock) || 0,
        image_url || null,
        category_id,
        supplier_id,
        specs ? JSON.stringify(specs) : null,
        socket_type || null,
        ddr_type || null,
        Number(wattage) || 0,
        form_factor || null,
      ],
    );

    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       WHERE p.id = ?`,
      [id],
    );
    logActivity("product", `Product "${name.trim()}" was added`);
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
      name,
      description,
      price,
      stock,
      image_url,
      category_id,
      supplier_id,
      specs,
      socket_type,
      ddr_type,
      wattage,
      form_factor,
      is_active,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Product name is required" });
    }
    if (!category_id) {
      return res.status(400).json({ error: "Category is required" });
    }
    if (!supplier_id) {
      return res.status(400).json({ error: "Supplier is required" });
    }

    const [[category]] = await pool.query(
      "SELECT id FROM categories WHERE id = ?",
      [category_id],
    );
    if (!category) {
      return res
        .status(400)
        .json({ error: "Selected category does not exist" });
    }
    const [[supplier]] = await pool.query(
      "SELECT id FROM suppliers WHERE id = ?",
      [supplier_id],
    );
    if (!supplier) {
      return res
        .status(400)
        .json({ error: "Selected supplier does not exist" });
    }

    const duplicate = await findDuplicateProduct(
      name,
      category_id,
      req.params.id,
    );
    if (duplicate) {
      return res.status(409).json({
        error: `Another product named "${duplicate.name}" already exists in this category`,
      });
    }

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
         is_active   = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        name.trim(),
        description || null,
        Number(price) || 0,
        Number(stock) || 0,
        image_url || null,
        category_id,
        supplier_id,
        specs ? JSON.stringify(specs) : null,
        socket_type || null,
        ddr_type || null,
        Number(wattage) || 0,
        form_factor || null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        req.params.id,
      ],
    );
    logActivity("product", `Product "${name.trim()}" was updated`);
    res.json({ message: "Product updated" });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/products/:id  (admin)
 * Archives the product (is_active = 0, archived_at = now) instead of
 * removing the row, so past orders referencing it keep working.
 */
const deleteProduct = async (req, res, next) => {
  try {
    const [[prod]] = await pool.query(
      "SELECT name FROM products WHERE id = ?",
      [req.params.id],
    );
    await pool.query(
      "UPDATE products SET is_active = 0, archived_at = NOW() WHERE id = ?",
      [req.params.id],
    );
    if (prod) logActivity("product", `Product "${prod.name}" was archived`);
    res.json({ message: "Product archived" });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/admin/products/:id/restore  (admin) — reactivate an archived product */
const restoreProduct = async (req, res, next) => {
  try {
    const [[prod]] = await pool.query(
      "SELECT name FROM products WHERE id = ?",
      [req.params.id],
    );
    await pool.query(
      "UPDATE products SET is_active = 1, archived_at = NULL WHERE id = ?",
      [req.params.id],
    );
    if (prod) logActivity("product", `Product "${prod.name}" was restored`);
    res.json({ message: "Product restored" });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/products  (admin - returns all including archived)
 */
const getAdminProducts = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       ORDER BY p.created_at DESC`,
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
    try {
      specs = JSON.parse(specs);
    } catch {
      specs = null;
    }
  }

  return {
    ...rest,
    price: parseFloat(rest.price) || 0,
    stock: parseInt(rest.stock, 10) || 0,
    wattage: parseInt(rest.wattage, 10) || 0,
    is_active: Boolean(rest.is_active),
    specs,
    categories: category_name ? { name: category_name } : null,
    suppliers: supplier_name ? { name: supplier_name } : null,
  };
}

module.exports = {
  getProducts,
  getBuilderProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  getAdminProducts,
};
