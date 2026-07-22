/**
 * controllers/cartController.js
 *
 * Shopping cart management.
 * All routes require authentication.
 * Cart items are per-user in the DB (persistent across sessions).
 */

const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

/**
 * GET /api/cart
 * Returns the current user's cart with product details
 */
const getCart = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ci.id, ci.quantity, ci.product_id,
              p.id AS p_id, p.name, p.price, p.image_url, p.stock
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = ?`,
      [req.user.id],
    );

    // Shape to match frontend CartItemWithProduct interface
    const cart = rows.map((row) => ({
      id: row.id,
      quantity: parseInt(row.quantity, 10),
      product_id: row.product_id,
      products: {
        id: row.p_id,
        name: row.name,
        price: parseFloat(row.price),
        image_url: row.image_url,
        stock: parseInt(row.stock, 10),
      },
    }));
    res.json(cart);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/cart
 * Body: { productId, quantity? }
 * Upserts: if item exists, increments quantity; else inserts
 */
const addToCart = async (req, res, next) => {
  try {
    const { productId, quantity = 1 } = req.body;
    if (!productId)
      return res.status(400).json({ error: "productId is required" });

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res
        .status(400)
        .json({ error: "Quantity must be a positive whole number" });
    }

    // Check product exists and has enough stock
    const [products] = await pool.query(
      "SELECT id, name, stock FROM products WHERE id = ? AND is_active = 1",
      [productId],
    );
    if (!products.length)
      return res.status(404).json({ error: "Product not found" });
    const product = products[0];

    // Check for existing cart item
    const [existing] = await pool.query(
      "SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?",
      [req.user.id, productId],
    );

    const currentQtyInCart = existing.length ? existing[0].quantity : 0;
    const requestedTotal = currentQtyInCart + qty;

    if (requestedTotal > product.stock) {
      return res.status(409).json({
        error:
          product.stock === 0
            ? `${product.name} is out of stock`
            : `Only ${product.stock} of "${product.name}" available${
                currentQtyInCart > 0
                  ? ` (you already have ${currentQtyInCart} in your cart)`
                  : ""
              }`,
      });
    }

    if (existing.length) {
      // Update quantity
      await pool.query(
        "UPDATE cart_items SET quantity = quantity + ? WHERE id = ?",
        [qty, existing[0].id],
      );
    } else {
      // Insert new item
      await pool.query(
        "INSERT INTO cart_items (id, user_id, product_id, quantity) VALUES (?, ?, ?, ?)",
        [uuidv4(), req.user.id, productId, qty],
      );
    }

    res.json({ message: "Added to cart" });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/cart/:itemId
 * Body: { quantity }
 * If quantity <= 0, deletes the item
 */
const updateCartItem = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const { itemId } = req.params;
    const qty = Number(quantity);

    if (qty <= 0) {
      await pool.query("DELETE FROM cart_items WHERE id = ? AND user_id = ?", [
        itemId,
        req.user.id,
      ]);
      return res.json({ message: "Item removed" });
    }

    // Never trust the frontend's cap — re-check the product's real stock.
    const [rows] = await pool.query(
      `SELECT ci.id, p.stock, p.name
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.id = ? AND ci.user_id = ?`,
      [itemId, req.user.id],
    );
    if (!rows.length)
      return res.status(404).json({ error: "Cart item not found" });

    if (qty > rows[0].stock) {
      return res.status(409).json({
        error: `Only ${rows[0].stock} of "${rows[0].name}" available`,
      });
    }

    await pool.query(
      "UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?",
      [qty, itemId, req.user.id],
    );
    res.json({ message: "Quantity updated" });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/cart
 * Clears the entire cart for the current user
 */
const clearCart = async (req, res, next) => {
  try {
    await pool.query("DELETE FROM cart_items WHERE user_id = ?", [req.user.id]);
    res.json({ message: "Cart cleared" });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCart, addToCart, updateCartItem, clearCart };
