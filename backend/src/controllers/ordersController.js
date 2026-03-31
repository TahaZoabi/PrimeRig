/**
 * controllers/ordersController.js
 *
 * Order placement and management.
 * Users can create/view their own orders.
 * Admins can view and update all orders.
 */

const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

/**
 * GET /api/orders
 * Returns current user's orders with order items and product info
 */
const getMyOrders = async (req, res, next) => {
  try {
    const [orders] = await pool.query(
      `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );

    if (!orders.length) return res.json([]);

    // Fetch order items for all orders at once
    const orderIds = orders.map((o) => o.id);
    const [items] = await pool.query(
      `SELECT oi.*, p.name AS product_name, p.image_url AS product_image
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id IN (?)`,
      [orderIds]
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
 * POST /api/orders
 * Body: { shippingAddress, paymentMethod }
 * Creates order from current cart, then clears cart
 */
const createOrder = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { shippingAddress, paymentMethod = "credit_card" } = req.body;

    // Get cart items
    const [cartItems] = await conn.query(
      `SELECT ci.product_id, ci.quantity, p.price, p.stock, p.name
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = ?`,
      [req.user.id]
    );

    if (!cartItems.length) {
      await conn.rollback();
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Calculate total
    const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // Create order
    const orderId = uuidv4();
    await conn.query(
      `INSERT INTO orders (id, user_id, total, shipping_address, payment_method)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, req.user.id, total, shippingAddress || null, paymentMethod]
    );

    // Create order items
    const itemValues = cartItems.map((item) => [
      uuidv4(),
      orderId,
      item.product_id,
      item.quantity,
      item.price,
    ]);

    await conn.query(
      "INSERT INTO order_items (id, order_id, product_id, quantity, price) VALUES ?",
      [itemValues]
    );

    // Clear cart
    await conn.query("DELETE FROM cart_items WHERE user_id = ?", [req.user.id]);

    await conn.commit();

    // Return the new order
    const [orders] = await pool.query("SELECT * FROM orders WHERE id = ?", [orderId]);
    const order = orders[0];
    res.status(201).json({ ...order, total: parseFloat(order.total) });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

/**
 * GET /api/admin/orders  (admin)
 * Returns all orders with items
 */
const getAllOrders = async (req, res, next) => {
  try {
    const [orders] = await pool.query(
      "SELECT * FROM orders ORDER BY created_at DESC"
    );

    if (!orders.length) return res.json([]);

    const orderIds = orders.map((o) => o.id);
    const [items] = await pool.query(
      `SELECT oi.*, p.name AS product_name
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id IN (?)`,
      [orderIds]
    );

    const itemsByOrder = {};
    items.forEach((item) => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push({
        id: item.id,
        quantity: item.quantity,
        price: parseFloat(item.price),
        products: { name: item.product_name },
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
 * PUT /api/admin/orders/:id/status  (admin)
 * Body: { status }
 */
const updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    await pool.query("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id]);
    res.json({ message: "Order status updated" });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMyOrders, createOrder, getAllOrders, updateOrderStatus };
