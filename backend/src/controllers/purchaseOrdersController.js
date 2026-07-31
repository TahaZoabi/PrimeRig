/**
 * controllers/purchaseOrdersController.js
 *
 * Internal Purchase Order records for inventory replenishment. These are
 * NEVER automatic purchases from a real supplier — they're records for a
 * human admin to act on, created either automatically by the auto-reorder
 * check in utils/orderFulfillment.js, or manually here via "Order From
 * Supplier".
 *
 * The website admin is not an employee of the supplier and cannot decide
 * when a supplier ships something — so the admin only ever performs three
 * actions on a purchase order:
 *   - Create it
 *   - Cancel it (only before it's been delivered)
 *   - Confirm Goods Received (only once it's been delivered)
 * Every stage in between (Sent to Supplier -> Supplier Accepted ->
 * Supplier Shipped -> Awaiting Delivery -> Delivered) is the supplier's
 * side of the process, which this app has no way to actually observe —
 * so it's simulated, one step at a time, via a "Simulate Supplier
 * Progress" action, explicitly separate from the admin's own actions.
 *
 * Stock only ever increases at "Goods Received" — the one place this file
 * writes to products.stock — and it always also records a restock_history
 * row so Purchase Orders (active, in-flight) and Restock History
 * (completed, including manual restocks) stay genuinely distinct.
 */

const { v4: uuidv4 } = require("uuid");
const pool = require("../db");
const { logActivity } = require("../utils/activityLog");

const PO_STATUSES = [
  "pending",
  "sent_to_supplier",
  "supplier_accepted",
  "supplier_shipped",
  "awaiting_delivery",
  "delivered",
  "received",
  "cancelled",
];

// The simulated supplier-side progression — advanced one step at a time by
// the admin's "Simulate Supplier Progress" action, purely for demo purposes.
// This never advances on its own; nothing in this app runs on a schedule.
const SUPPLIER_PROGRESS_SEQUENCE = [
  "pending",
  "sent_to_supplier",
  "supplier_accepted",
  "supplier_shipped",
  "awaiting_delivery",
  "delivered",
];

// The admin can cancel at any point before the goods have actually arrived —
// once "delivered", cancelling wouldn't reflect reality (it's already here).
const CANCELLABLE_STATUSES = SUPPLIER_PROGRESS_SEQUENCE.filter(
  (s) => s !== "delivered",
);

/**
 * GET /api/admin/purchase-orders?status=...  (admin)
 * No status param returns all purchase orders.
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
 * PUT /api/admin/purchase-orders/:id/cancel  (admin)
 * Only valid before the order has actually been delivered.
 */
const cancelPurchaseOrder = async (req, res, next) => {
  try {
    const [[po]] = await pool.query(
      `SELECT po.status, p.name AS product_name
       FROM purchase_orders po JOIN products p ON p.id = po.product_id
       WHERE po.id = ?`,
      [req.params.id],
    );
    if (!po) return res.status(404).json({ error: "Purchase order not found" });

    if (!CANCELLABLE_STATUSES.includes(po.status)) {
      return res.status(400).json({
        error:
          po.status === "delivered" || po.status === "received"
            ? "This order has already been delivered and can no longer be cancelled"
            : `Cannot cancel a purchase order that is already ${po.status}`,
      });
    }

    await pool.query(
      "UPDATE purchase_orders SET status = 'cancelled' WHERE id = ?",
      [req.params.id],
    );

    logActivity(
      "purchase_order",
      `Purchase order for "${po.product_name}" was cancelled`,
    );
    res.json({ message: "Purchase order cancelled" });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/purchase-orders/:id/simulate-progress  (admin)
 * Advances the SIMULATED supplier-side status by exactly one step — this
 * stands in for the supplier's own warehouse/shipping system, which this
 * app has no real integration with. Not something a real admin action
 * would represent; provided for demo purposes.
 */
const simulateSupplierProgress = async (req, res, next) => {
  try {
    const [[po]] = await pool.query(
      `SELECT po.status, p.name AS product_name
       FROM purchase_orders po JOIN products p ON p.id = po.product_id
       WHERE po.id = ?`,
      [req.params.id],
    );
    if (!po) return res.status(404).json({ error: "Purchase order not found" });

    const currentIndex = SUPPLIER_PROGRESS_SEQUENCE.indexOf(po.status);
    if (
      currentIndex === -1 ||
      currentIndex === SUPPLIER_PROGRESS_SEQUENCE.length - 1
    ) {
      return res.status(400).json({
        error: `Cannot simulate further progress — order is already ${po.status}`,
      });
    }

    const nextStatus = SUPPLIER_PROGRESS_SEQUENCE[currentIndex + 1];
    await pool.query("UPDATE purchase_orders SET status = ? WHERE id = ?", [
      nextStatus,
      req.params.id,
    ]);

    logActivity(
      "purchase_order",
      `[Simulated] "${po.product_name}" order progressed to ${nextStatus.replace(/_/g, " ")}`,
    );
    res.json({ message: "Supplier progress simulated", status: nextStatus });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/purchase-orders/:id/receive  (admin)
 * The ONLY warehouse action a real admin performs on this workflow:
 * confirming that a shipment has actually arrived. Only valid once the
 * (simulated) supplier side has reached "delivered". This is the one
 * moment stock actually increases.
 */
const receivePurchaseOrder = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
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
    if (po.status !== "delivered") {
      await conn.rollback();
      return res.status(400).json({
        error:
          po.status === "received"
            ? "This purchase order has already been received"
            : `Cannot confirm receipt yet — this order hasn't been delivered (currently: ${po.status.replace(/_/g, " ")})`,
      });
    }

    await conn.query(
      "UPDATE purchase_orders SET status = 'received' WHERE id = ?",
      [req.params.id],
    );

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

    await conn.commit();

    logActivity(
      "purchase_order",
      `Received ${po.quantity} units of "${po.product_name}" — stock updated`,
    );
    res.json({ message: "Goods received — stock updated" });
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
  cancelPurchaseOrder,
  simulateSupplierProgress,
  receivePurchaseOrder,
};
