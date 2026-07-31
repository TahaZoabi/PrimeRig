/**
 * controllers/purchaseOrdersController.js
 *
 * Internal Purchase Order records for inventory replenishment. These are
 * NEVER automatic purchases from a real supplier — they're records for a
 * human admin to act on, created either automatically by the auto-reorder
 * check in utils/orderFulfillment.js, or manually here via "Order From
 * Supplier".
 *
 * Lifecycle: pending -> approved -> shipped -> delivered -> received
 *                  \-> cancelled     \-> cancelled
 * Stock only ever increases at the "received" step — that's the one place
 * this file writes to products.stock, and it always also records a
 * restock_history row so Purchase Orders (active, in-flight) and Restock
 * History (completed, including manual restocks) stay genuinely distinct.
 */

const { v4: uuidv4 } = require("uuid");
const pool = require("../db");
const { logActivity } = require("../utils/activityLog");

const PO_STATUSES = [
  "pending",
  "approved",
  "shipped",
  "delivered",
  "received",
  "cancelled",
];

const ALLOWED_TRANSITIONS = {
  pending: ["approved", "cancelled"],
  approved: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["received"],
  received: [],
  cancelled: [],
};

/**
 * GET /api/admin/purchase-orders?status=pending|approved|shipped|delivered|received|cancelled
 * (admin) — no status param returns all purchase orders.
 */
const getPurchaseOrders = async (req, res, next) => {
  try {
    const { status } = req.query;
    if (status && !PO_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const [rows] = await pool.query(
      `SELECT po.*, p.name AS product_name, s.name AS supplier_name
       FROM purchase_orders po
       JOIN products p ON p.id = po.product_id
       JOIN suppliers s ON s.id = po.supplier_id
       ${status ? "WHERE po.status = ?" : ""}
       ORDER BY po.updated_at DESC`,
      status ? [status] : [],
    );

    res.json(
      rows.map((row) => ({
        id: row.id,
        product_id: row.product_id,
        supplier_id: row.supplier_id,
        product_name: row.product_name,
        supplier_name: row.supplier_name,
        quantity: row.quantity,
        status: row.status,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    );
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/purchase-orders  (admin)
 * Body: { product_id, supplier_id?, quantity }
 * Manual "Order From Supplier" action. Unlike the auto-reorder check, this
 * is always allowed regardless of any existing pending order for the same
 * product — it's a deliberate admin decision, not a background trigger.
 */
const createPurchaseOrder = async (req, res, next) => {
  try {
    const { product_id, supplier_id, quantity } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: "Product is required" });
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res
        .status(400)
        .json({ error: "Quantity must be a positive whole number" });
    }

    const [[product]] = await pool.query(
      "SELECT id, name, supplier_id, preferred_supplier_id FROM products WHERE id = ?",
      [product_id],
    );
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const resolvedSupplierId =
      supplier_id || product.preferred_supplier_id || product.supplier_id;
    if (!resolvedSupplierId) {
      return res.status(400).json({
        error:
          "This product has no supplier set — choose one, or set a Preferred Supplier on the product first",
      });
    }
    const [[supplier]] = await pool.query(
      "SELECT id, name FROM suppliers WHERE id = ?",
      [resolvedSupplierId],
    );
    if (!supplier) {
      return res
        .status(400)
        .json({ error: "Selected supplier does not exist" });
    }

    const poId = uuidv4();
    await pool.query(
      `INSERT INTO purchase_orders (id, product_id, supplier_id, quantity, status, created_by)
       VALUES (?, ?, ?, ?, 'pending', 'manual')`,
      [poId, product_id, resolvedSupplierId, qty],
    );

    logActivity(
      "purchase_order",
      `Purchase order created manually for "${product.name}" (qty ${qty}) from ${supplier.name}`,
    );

    res.status(201).json({ id: poId, message: "Purchase order created" });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/purchase-orders/:id/status  (admin)
 * Body: { status }
 */
const updatePurchaseOrderStatus = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { status } = req.body;
    if (!PO_STATUSES.includes(status)) {
      conn.release();
      return res.status(400).json({ error: "Invalid status" });
    }

    await conn.beginTransaction();

    const [[po]] = await conn.query(
      `SELECT po.*, p.name AS product_name
       FROM purchase_orders po
       JOIN products p ON p.id = po.product_id
       WHERE po.id = ?
       FOR UPDATE`,
      [req.params.id],
    );
    if (!po) {
      await conn.rollback();
      return res.status(404).json({ error: "Purchase order not found" });
    }

    const currentStatus = po.status;
    if (currentStatus === status) {
      await conn.rollback();
      return res
        .status(400)
        .json({ error: `Purchase order is already ${status}` });
    }
    if (!ALLOWED_TRANSITIONS[currentStatus]?.includes(status)) {
      await conn.rollback();
      return res.status(400).json({
        error: `Cannot change purchase order status from "${currentStatus}" to "${status}"`,
      });
    }

    await conn.query("UPDATE purchase_orders SET status = ? WHERE id = ?", [
      status,
      req.params.id,
    ]);

    // Receiving a purchase order is the one moment stock actually increases —
    // and it always leaves a Restock History record referencing this PO.
    if (status === "received") {
      const [[{ stock: previousStock }]] = await conn.query(
        "SELECT stock FROM products WHERE id = ? FOR UPDATE",
        [po.product_id],
      );
      const newStock = previousStock + po.quantity;
      await conn.query("UPDATE products SET stock = ? WHERE id = ?", [
        newStock,
        po.product_id,
      ]);
      await conn.query(
        `INSERT INTO restock_history
           (id, product_id, purchase_order_id, quantity, previous_stock, new_stock, source)
         VALUES (?, ?, ?, ?, ?, ?, 'purchase_order')`,
        [uuidv4(), po.product_id, po.id, po.quantity, previousStock, newStock],
      );
    }

    await conn.commit();

    logActivity(
      "purchase_order",
      status === "received"
        ? `Received ${po.quantity} units of "${po.product_name}" — stock updated`
        : `Purchase order for "${po.product_name}" marked ${status}`,
    );

    res.json({ message: "Purchase order status updated" });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

module.exports = {
  getPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrderStatus,
};
