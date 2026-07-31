/**
 * controllers/inventoryController.js
 *
 * Read-only aggregate views for the Inventory tab: a rich per-product
 * overview (used for the Low Stock / Out of Stock lists, with Auto Restock
 * status, next restock quantity, preferred supplier, last restock date, and
 * last purchase order status all resolved server-side) and the Restock
 * History feed (completed inventory additions — manual or via a received
 * Purchase Order).
 */

const pool = require("../db");

/**
 * GET /api/admin/inventory/overview  (admin)
 * All active products with everything the Inventory tab's Low Stock / Out
 * of Stock lists need to display in one call — including data that isn't
 * on the product row itself (last restock date, last PO status).
 */
const getInventoryOverview = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        p.id, p.name, p.stock, p.min_stock, p.target_stock_level, p.auto_reorder,
        p.supplier_id, p.preferred_supplier_id,
        c.name  AS category_name,
        s.name  AS supplier_name,
        ps.name AS preferred_supplier_name,
        (SELECT rh.created_at FROM restock_history rh
          WHERE rh.product_id = p.id ORDER BY rh.created_at DESC LIMIT 1) AS last_restock_date,
        (SELECT po.status FROM purchase_orders po
          WHERE po.product_id = p.id ORDER BY po.updated_at DESC LIMIT 1) AS last_po_status
      FROM products p
      LEFT JOIN categories c  ON c.id = p.category_id
      LEFT JOIN suppliers  s  ON s.id = p.supplier_id
      LEFT JOIN suppliers  ps ON ps.id = p.preferred_supplier_id
      WHERE p.is_active = 1
      ORDER BY p.stock ASC
    `);

    res.json(
      rows.map((p) => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
        min_stock: p.min_stock,
        target_stock_level: p.target_stock_level,
        auto_reorder: Boolean(p.auto_reorder),
        supplier_id: p.supplier_id,
        preferred_supplier_id: p.preferred_supplier_id,
        category_name: p.category_name,
        supplier_name: p.supplier_name,
        preferred_supplier_name: p.preferred_supplier_name || p.supplier_name,
        next_restock_quantity: p.auto_reorder
          ? Math.max(p.target_stock_level - p.stock, 0)
          : null,
        last_restock_date: p.last_restock_date,
        last_po_status: p.last_po_status,
      })),
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/restock-history  (admin)
 * Every completed inventory addition — manual or via a received Purchase
 * Order — most recent first. Distinct from Purchase Orders: this is only
 * ever populated at the moment stock actually increases.
 */
const getRestockHistory = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT rh.*, p.name AS product_name, s.name AS supplier_name
      FROM restock_history rh
      JOIN products p ON p.id = rh.product_id
      LEFT JOIN purchase_orders po ON po.id = rh.purchase_order_id
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      ORDER BY rh.created_at DESC
      LIMIT 100
    `);

    res.json(
      rows.map((r) => ({
        id: r.id,
        product_name: r.product_name,
        supplier_name: r.supplier_name,
        quantity: r.quantity,
        previous_stock: r.previous_stock,
        new_stock: r.new_stock,
        source: r.source,
        purchase_order_id: r.purchase_order_id,
        created_at: r.created_at,
      })),
    );
  } catch (err) {
    next(err);
  }
};

module.exports = { getInventoryOverview, getRestockHistory };
