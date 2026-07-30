/**
 * controllers/purchaseOrdersController.js
 *
 * Internal Purchase Order records for inventory replenishment. These are
 * NEVER automatic purchases from a real supplier — they're records for a
 * human admin to act on (created automatically by the auto-reorder check
 * in utils/orderFulfillment.js, or transitioned manually here).
 *
 * Lifecycle: pending -> ordered -> received
 *                 \-> cancelled      \-> cancelled
 * Marking a purchase order "received" is the one point where stock is
 * actually increased — that's what "receiving" a restock means.
 */

const pool = require("../db");
const { logActivity } = require("../utils/activityLog");

const PO_STATUSES = ["pending", "ordered", "received", "cancelled"];

const ALLOWED_TRANSITIONS = {
  pending: ["ordered", "cancelled"],
  ordered: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

/**
 * GET /api/admin/purchase-orders?status=pending|ordered|received|cancelled
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
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    );
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

    // Receiving a purchase order is the moment stock actually increases.
    if (status === "received") {
      await conn.query("UPDATE products SET stock = stock + ? WHERE id = ?", [
        po.quantity,
        po.product_id,
      ]);
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

module.exports = { getPurchaseOrders, updatePurchaseOrderStatus };
