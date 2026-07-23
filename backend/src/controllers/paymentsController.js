/**
 * controllers/paymentsController.js
 *
 * PayPal Sandbox payment integration (Orders v2 API).
 * The backend is the only party that ever talks to PayPal with real
 * credentials — the frontend only ever sees a PayPal order ID, never the
 * client secret, and never decides on its own whether a payment succeeded.
 *
 * Flow:
 *   1. POST /api/payments/paypal/create-order
 *        - Server computes the cart total itself (never trusts the
 *          frontend for the amount).
 *        - Creates a PayPal order for that amount, returns its id.
 *   2. Customer approves the payment in the PayPal popup (frontend/PayPal).
 *   3. POST /api/payments/paypal/capture-order
 *        - Captures the PayPal order server-side (the actual proof of
 *          payment — this cannot be faked from the frontend).
 *        - Re-validates stock/total against the live database.
 *        - Only on a verified COMPLETED capture, with a matching amount,
 *          does it create the DB order, decrement stock, and clear the
 *          cart, with status "processing".
 *
 * Idempotency: capture-order is keyed on the PayPal order id. If that id
 * already produced a real order (a duplicate callback, a client retry,
 * a double-click), the existing order is returned and nothing is
 * re-processed or duplicated.
 */

const pool = require("../db");
const { logActivity } = require("../utils/activityLog");
const { getClient, paypal } = require("../utils/paypalClient");
const {
  lockAndValidateCart,
  finalizeOrder,
  ValidationError,
} = require("../utils/orderFulfillment");

/**
 * POST /api/payments/paypal/create-order
 */
const createPaypalOrder = async (req, res, next) => {
  let total;

  // Validate the cart now (read-only — nothing is written) so we don't send
  // the customer into PayPal only to fail at the final step.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    ({ total } = await lockAndValidateCart(conn, req.user.id));
    await conn.rollback(); // release the row locks; this was a read-only check
  } catch (err) {
    await conn.rollback();
    conn.release();
    if (err instanceof ValidationError) {
      return res.status(err.status).json({ error: err.message });
    }
    return next(err);
  }
  conn.release();

  try {
    const client = getClient();
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: total.toFixed(2),
          },
        },
      ],
    });

    const response = await client.execute(request);
    res.json({ id: response.result.id });
  } catch (err) {
    if (err.message?.includes("PayPal is not configured")) {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * POST /api/payments/paypal/capture-order
 * Body: { orderID, shippingAddress }
 */
const capturePaypalOrder = async (req, res, next) => {
  try {
    const { orderID, shippingAddress } = req.body;
    if (!orderID) {
      return res.status(400).json({ error: "orderID is required" });
    }

    // Idempotency: if this PayPal order already produced a real order,
    // return it as-is instead of processing (and never duplicating) it.
    const [[existingOrder]] = await pool.query(
      "SELECT id FROM orders WHERE paypal_order_id = ?",
      [orderID],
    );
    if (existingOrder) {
      return res.json({ id: existingOrder.id, alreadyProcessed: true });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Re-validate stock/total against the live database right before
      // finalizing — a moment may have passed since create-order.
      const { cartItems, total } = await lockAndValidateCart(conn, req.user.id);

      const client = getClient();
      const request = new paypal.orders.OrdersCaptureRequest(orderID);
      request.requestBody({});

      let captureResponse;
      try {
        captureResponse = await client.execute(request);
      } catch (paypalErr) {
        await conn.rollback();
        return res.status(402).json({
          error: "PayPal could not verify this payment. No order was created.",
        });
      }

      const result = captureResponse.result;
      if (result.status !== "COMPLETED") {
        await conn.rollback();
        return res.status(402).json({
          error: `Payment was not completed (status: ${result.status}). No order was created.`,
        });
      }

      const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
      const capturedAmount = Number(capture?.amount?.value ?? 0);

      // Defense in depth: the amount PayPal actually captured must match
      // what we expect (within a cent, for floating-point safety).
      if (Math.abs(capturedAmount - total) > 0.01) {
        await conn.rollback();
        return res.status(409).json({
          error:
            "Payment amount does not match the current cart total. No order was created.",
        });
      }

      const orderId = await finalizeOrder(conn, req.user.id, cartItems, total, {
        paymentMethod: "paypal",
        paypalOrderId: orderID,
        paypalCaptureId: capture?.id || null,
        paymentStatus: "paid",
        shippingAddress,
      });

      await conn.commit();

      logActivity(
        "order",
        `Customer ${req.user.full_name || req.user.email} paid via PayPal for order #${orderId.slice(0, 8).toUpperCase()} ($${total.toFixed(2)})`,
      );

      res.status(201).json({ id: orderId, alreadyProcessed: false });
    } catch (err) {
      await conn.rollback();
      if (err instanceof ValidationError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
};

module.exports = { createPaypalOrder, capturePaypalOrder };
