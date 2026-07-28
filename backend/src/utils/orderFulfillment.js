/**
 * utils/orderFulfillment.js
 *
 * Shared "turn a validated cart into a real order" logic. Extracted so the
 * PayPal capture flow (paymentsController.js) can reuse the exact same
 * stock-validation and order-creation transaction that the old direct
 * checkout endpoint used — no duplicated business logic between the two.
 *
 * Also owns the auto-reorder check: whenever an order decrements a
 * product's stock, if the resulting stock is at or below that product's
 * configured minimum and Auto Reorder is enabled, an internal Purchase
 * Order is created automatically (never a real purchase from the
 * supplier — this only creates a record for a human to act on).
 */

const { v4: uuidv4 } = require("uuid");
const { logActivity } = require("./activityLog");

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
    `SELECT ci.product_id, ci.quantity, p.price, p.stock, p.name, p.is_active,
            p.auto_reorder, p.min_stock, p.reorder_quantity,
            p.preferred_supplier_id, p.supplier_id
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
 * After decrementing a product's stock, create an internal Purchase Order
 * if it's now at/below its minimum and Auto Reorder is enabled — but never
 * if a Pending purchase order already exists for that product. This never
 * contacts a real supplier; it only records that a human should reorder.
 */
async function maybeCreatePurchaseOrder(conn, item, newStock) {
  if (!item.auto_reorder || newStock > item.min_stock) return;

  const [[existingPending]] = await conn.query(
    `SELECT id FROM purchase_orders WHERE product_id = ? AND status = 'pending'`,
    [item.product_id],
  );
  if (existingPending) return;

  const supplierId = item.preferred_supplier_id || item.supplier_id;
  if (!supplierId) return; // nothing sensible to order from

  const quantity = item.reorder_quantity > 0 ? item.reorder_quantity : 1;
  const poId = uuidv4();
  await conn.query(
    `INSERT INTO purchase_orders (id, product_id, supplier_id, quantity, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [poId, item.product_id, supplierId, quantity],
  );

  logActivity(
    "purchase_order",
    `Auto Reorder: purchase order created for "${item.name}" (qty ${quantity}) — stock at ${newStock}`,
  );
}

/**
 * Insert the order + order_items, decrement stock for every purchased item
 * (triggering auto-reorder checks as needed), record the initial status
 * history entry, and clear the cart. Must run inside the same transaction
 * that locked the cart via lockAndValidateCart. Returns the new order's id.
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
    const [[{ stock: newStock }]] = await conn.query(
      "SELECT stock FROM products WHERE id = ?",
      [item.product_id],
    );
    await maybeCreatePurchaseOrder(conn, item, newStock);
  }

  await conn.query("DELETE FROM cart_items WHERE user_id = ?", [userId]);

  // Record the order's initial status for the Order Timeline. "Paid" is
  // read directly from orders.paid_at (already set above when applicable),
  // not stored in this history table.
  await conn.query(
    "INSERT INTO order_status_history (id, order_id, status) VALUES (?, ?, 'processing')",
    [uuidv4(), orderId],
  );

  return orderId;
}

module.exports = { lockAndValidateCart, finalizeOrder, ValidationError };
