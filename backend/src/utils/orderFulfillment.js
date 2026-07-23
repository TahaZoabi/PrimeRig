/**
 * utils/orderFulfillment.js
 *
 * Shared "turn a validated cart into a real order" logic. Extracted so the
 * PayPal capture flow (paymentsController.js) can reuse the exact same
 * stock-validation and order-creation transaction that the old direct
 * checkout endpoint used — no duplicated business logic between the two.
 */

const { v4: uuidv4 } = require("uuid");

/** A validation failure that should be surfaced as a specific HTTP status. */
class ValidationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Lock the user's cart items (FOR UPDATE — must run inside an active
 * transaction on `conn`) and validate every item against live stock. Never
 * trust a frontend-supplied total or cart snapshot; this is always
 * (re-)computed here from the database.
 *
 * Returns { cartItems, total }.
 * Throws ValidationError if the cart is empty or any item is out of stock /
 * no longer active — callers should catch this, roll back, and forward
 * err.message to the client with status err.status.
 */
async function lockAndValidateCart(conn, userId) {
  const [cartItems] = await conn.query(
    `SELECT ci.product_id, ci.quantity, p.price, p.stock, p.name, p.is_active
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = ?
     FOR UPDATE`,
    [userId],
  );

  if (!cartItems.length) {
    throw new ValidationError(400, "Cart is empty");
  }

  const problems = [];
  for (const item of cartItems) {
    if (!item.is_active) {
      problems.push(`"${item.name}" is no longer available`);
    } else if (item.quantity > item.stock) {
      problems.push(
        item.stock === 0
          ? `"${item.name}" is out of stock`
          : `Only ${item.stock} of "${item.name}" left in stock (you have ${item.quantity} in your cart)`,
      );
    }
  }
  if (problems.length) {
    throw new ValidationError(409, problems.join("; "));
  }

  const total = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  return { cartItems, total };
}

/**
 * Insert the order + order_items, decrement stock for every purchased item,
 * and clear the cart. Must run inside the same transaction that locked the
 * cart via lockAndValidateCart. Returns the new order's id.
 *
 * paymentInfo: {
 *   paymentMethod: string,               e.g. "paypal"
 *   paypalOrderId?: string | null,
 *   paypalCaptureId?: string | null,
 *   paymentStatus: "paid" | "unpaid",
 *   shippingAddress?: string | null,
 * }
 */
async function finalizeOrder(conn, userId, cartItems, total, paymentInfo) {
  const orderId = uuidv4();

  await conn.query(
    `INSERT INTO orders
       (id, user_id, total, shipping_address, payment_method, status,
        paypal_order_id, paypal_capture_id, payment_status, paid_at)
     VALUES (?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?)`,
    [
      orderId,
      userId,
      total,
      paymentInfo.shippingAddress || null,
      paymentInfo.paymentMethod,
      paymentInfo.paypalOrderId || null,
      paymentInfo.paypalCaptureId || null,
      paymentInfo.paymentStatus,
      paymentInfo.paymentStatus === "paid" ? new Date() : null,
    ],
  );

  const itemValues = cartItems.map((item) => [
    uuidv4(),
    orderId,
    item.product_id,
    item.quantity,
    item.price,
  ]);
  await conn.query(
    "INSERT INTO order_items (id, order_id, product_id, quantity, price) VALUES ?",
    [itemValues],
  );

  for (const item of cartItems) {
    await conn.query("UPDATE products SET stock = stock - ? WHERE id = ?", [
      item.quantity,
      item.product_id,
    ]);
  }

  await conn.query("DELETE FROM cart_items WHERE user_id = ?", [userId]);

  return orderId;
}

module.exports = { lockAndValidateCart, finalizeOrder, ValidationError };
