/**
 * controllers/ordersController.js
 *
 * Order placement and management.
 * Users can create/view their own orders.
 * Admins can view and update all orders.
 */

const pool = require("../db");
const { logActivity } = require("../utils/activityLog");
const { v4: uuidv4 } = require("uuid");
const {
  PERIODS,
  resolveRange,
  InvalidRangeError,
} = require("../utils/dateRange");

/**
 * GET /api/orders
 * Returns current user's orders with order items and product info
 */
const getMyOrders = async (req, res, next) => {
  try {
    const [orders] = await pool.query(
      `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id],
    );

    if (!orders.length) return res.json([]);

    // Fetch order items for all orders at once
    const orderIds = orders.map((o) => o.id);
    const [items] = await pool.query(
      `SELECT oi.*, p.name AS product_name, p.image_url AS product_image
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id IN (?)`,
      [orderIds],
    );

    // Group items by order_id
    const itemsByOrder = {};
    items.forEach((item) => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push({
        id: item.id,
        order_id: item.order_id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: parseFloat(item.price),
        products: { name: item.product_name, image_url: item.product_image },
      });
    });

    const result = orders.map((order) => ({
      ...order,
      total: parseFloat(order.total),
      order_items: itemsByOrder[order.id] || [],
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/orders  (admin)
 * Returns orders with items and basic customer info, optionally filtered by
 * the same period/date-range scheme used by GET /api/admin/stats. No period
 * param = all orders (unchanged default behavior for any other caller).
 */
const getAllOrders = async (req, res, next) => {
  try {
    const { period = "all", startDate, endDate, status } = req.query;

    if (!PERIODS.includes(period)) {
      return res.status(400).json({ error: "Invalid period" });
    }
    if (period === "custom" && (!startDate || !endDate)) {
      return res.status(400).json({
        error: "startDate and endDate are required for a custom range",
      });
    }

    // Optional comma-separated status filter, e.g. "?status=processing,shipped"
    // — used by the Overview dashboard's "Needs Attention" section to pull
    // only orders that still need action, without a separate endpoint.
    let statusList = null;
    if (status) {
      statusList = String(status)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const invalid = statusList.filter((s) => !ORDER_STATUSES.includes(s));
      if (invalid.length) {
        return res
          .status(400)
          .json({ error: `Invalid status: ${invalid.join(", ")}` });
      }
    }

    let start, end;
    try {
      ({ start, end } = resolveRange(period, startDate, endDate));
    } catch (e) {
      if (e instanceof InvalidRangeError) {
        return res.status(e.status).json({ error: e.message });
      }
      throw e;
    }

    const rangeSql = start
      ? "o.created_at >= ? AND o.created_at <= ?"
      : "o.created_at <= ?";
    const rangeParams = start ? [start, end] : [end];
    const statusSql = statusList ? "AND o.status IN (?)" : "";
    const queryParams = statusList ? [...rangeParams, statusList] : rangeParams;

    const [orders] = await pool.query(
      `SELECT o.*, u.full_name AS customer_name, u.email AS customer_email,
              p.phone AS customer_phone
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN profiles p ON p.user_id = o.user_id
       WHERE ${rangeSql} ${statusSql}
       ORDER BY o.created_at DESC`,
      queryParams,
    );

    if (!orders.length) return res.json([]);

    const orderIds = orders.map((o) => o.id);
    const [items] = await pool.query(
      `SELECT oi.*, p.name AS product_name, p.image_url AS product_image
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id IN (?)`,
      [orderIds],
    );

    const itemsByOrder = {};
    items.forEach((item) => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push({
        id: item.id,
        quantity: item.quantity,
        price: parseFloat(item.price),
        products: { name: item.product_name, image_url: item.product_image },
      });
    });

    const result = orders.map((order) => ({
      ...order,
      total: parseFloat(order.total),
      order_items: itemsByOrder[order.id] || [],
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/orders/:id  (admin)
 * Full detail for a single order — customer info, items, and the status
 * timeline — used by the Order Details modal. Kept separate from the list
 * endpoint above so listing orders doesn't pay the cost of fetching full
 * timeline history for every row.
 */
const getOrderDetails = async (req, res, next) => {
  try {
    const [[order]] = await pool.query(
      `SELECT o.*, u.full_name AS customer_name, u.email AS customer_email,
              p.phone AS customer_phone
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN profiles p ON p.user_id = o.user_id
       WHERE o.id = ?`,
      [req.params.id],
    );
    if (!order) return res.status(404).json({ error: "Order not found" });

    const [items] = await pool.query(
      `SELECT oi.*, p.name AS product_name, p.image_url AS product_image
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [order.id],
    );

    const [history] = await pool.query(
      `SELECT status, created_at FROM order_status_history
       WHERE order_id = ? ORDER BY created_at ASC`,
      [order.id],
    );

    res.json({
      ...order,
      total: parseFloat(order.total),
      order_items: items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: parseFloat(item.price),
        products: { name: item.product_name, image_url: item.product_image },
      })),
      status_history: history,
    });
  } catch (err) {
    next(err);
  }
};

const ORDER_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

/**
 * Valid manual admin transitions. Orders are created as "processing"
 * directly (see orderFulfillment.js), so "pending" is reachable in
 * principle but not produced by the current checkout flow. Cancellation is
 * only allowed before an order has shipped — once it's physically on its
 * way, marking it "cancelled" would no longer reflect reality.
 */
const ALLOWED_TRANSITIONS = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/**
 * PUT /api/admin/orders/:id/status  (admin)
 * Body: { status }
 */
const updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const [[order]] = await pool.query(
      "SELECT status FROM orders WHERE id = ?",
      [req.params.id],
    );
    if (!order) return res.status(404).json({ error: "Order not found" });

    const currentStatus = order.status;
    if (currentStatus === status) {
      return res.status(400).json({ error: `Order is already ${status}` });
    }
    if (!ALLOWED_TRANSITIONS[currentStatus]?.includes(status)) {
      return res.status(400).json({
        error: `Cannot change order status from "${currentStatus}" to "${status}"`,
      });
    }

    await pool.query("UPDATE orders SET status = ? WHERE id = ?", [
      status,
      req.params.id,
    ]);
    await pool.query(
      "INSERT INTO order_status_history (id, order_id, status) VALUES (?, ?, ?)",
      [uuidv4(), req.params.id, status],
    );

    const shortId = req.params.id.slice(0, 8).toUpperCase();
    logActivity(
      "order",
      status === "cancelled"
        ? `Order #${shortId} was cancelled`
        : `Order #${shortId} status changed to ${status}`,
    );

    res.json({ message: "Order status updated" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMyOrders,
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
};
