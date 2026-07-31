/**
 * seedInventoryWorkflow.js
 *
 * Realistic demo data for the supplier purchasing / inventory workflow, so
 * every tab of the Inventory dashboard (Low Stock, Out of Stock, Active
 * Purchase Orders, Restock History) has meaningful data to show, and every
 * Purchase Order status (Pending, Approved, Shipped, Delivered, Received,
 * Cancelled) is represented at least once.
 *
 * Safe to run against a database that already has some demo data in it
 * (e.g. from earlier seed scripts): categories, suppliers, and products are
 * looked up by name first and reused if they already exist, rather than
 * assuming a blank database and failing on duplicate names. Run with:
 *   node src/seedInventoryWorkflow.js
 * or:
 *   npm run seed:inventory
 */
require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const pool = require("./db");

async function findOrCreateCategory(name) {
  const [[existing]] = await pool.query(
    "SELECT id FROM categories WHERE name = ?",
    [name],
  );
  if (existing) return existing.id;
  const id = uuidv4();
  await pool.query("INSERT INTO categories (id, name) VALUES (?, ?)", [
    id,
    name,
  ]);
  return id;
}

async function findOrCreateSupplier(name) {
  const [[existing]] = await pool.query(
    "SELECT id FROM suppliers WHERE name = ?",
    [name],
  );
  if (existing) return existing.id;
  const id = uuidv4();
  await pool.query("INSERT INTO suppliers (id, name) VALUES (?, ?)", [
    id,
    name,
  ]);
  return id;
}

/**
 * Reuses a product with this exact name if one already exists (from a
 * previous run of this same script), updating its inventory settings to
 * match this seed's definitions. Otherwise creates it fresh.
 */
async function findOrCreateProduct(
  name,
  price,
  stock,
  categoryId,
  supplierId,
  auto,
  min,
  target,
  preferredId,
) {
  const [[existing]] = await pool.query(
    "SELECT id FROM products WHERE name = ?",
    [name],
  );
  if (existing) {
    await pool.query(
      `UPDATE products SET
         stock = ?, auto_reorder = ?, min_stock = ?, target_stock_level = ?,
         preferred_supplier_id = ?
       WHERE id = ?`,
      [stock, auto, min, target, preferredId, existing.id],
    );
    return existing.id;
  }
  const id = uuidv4();
  await pool.query(
    `INSERT INTO products
       (id, name, price, stock, category_id, supplier_id, is_active,
        auto_reorder, min_stock, target_stock_level, preferred_supplier_id)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [
      id,
      name,
      price,
      stock,
      categoryId,
      supplierId,
      auto,
      min,
      target,
      preferredId,
    ],
  );
  return id;
}

async function main() {
  console.log("Seeding inventory workflow demo data...");

  const catId = await findOrCreateCategory("Components");

  const supA = await findOrCreateSupplier("Corsair Supply Co");
  const supB = await findOrCreateSupplier("Western Digital");
  const supC = await findOrCreateSupplier("Noctua Distribution");

  // [name, price, stock, auto_reorder, min_stock, target_stock_level, supplier, preferred_supplier]
  const productDefs = [
    // Below threshold, Auto Restock ON -> should have an auto-created pending PO
    ["Corsair RM850x PSU", 139.99, 3, 1, 5, 20, supA, supA],
    // Below threshold, Auto Restock OFF -> warning only, no auto PO
    ["Noctua NH-D15", 109.99, 2, 0, 5, 15, supC, supC],
    // Out of stock, Auto Restock ON
    ["Seagate Barracuda 4TB HDD", 79.99, 0, 1, 10, 50, supB, supB],
    // Healthy stock, Auto Restock ON, used for the "approved" PO example
    ["WD Black SN850X 1TB", 89.99, 25, 1, 8, 30, supB, supB],
    // Healthy stock, used for "shipped" PO example
    ["Corsair Vengeance 32GB DDR5", 109.99, 18, 0, 5, 25, supA, supA],
    // Healthy stock, used for "delivered" PO example
    ["Corsair iCUE H150i Elite", 179.99, 12, 0, 4, 16, supA, supA],
    // Used for "received" (Restock History via PO) example — already topped up
    ["Noctua NF-A12x25 Fan", 29.99, 40, 0, 10, 40, supC, supC],
    // Used for "cancelled" PO example
    ["ASUS ROG Strix Z790-E", 449.99, 7, 0, 3, 12, supA, supA],
  ];

  const productIds = {};
  for (const [
    name,
    price,
    stock,
    auto,
    min,
    target,
    supplierId,
    preferredId,
  ] of productDefs) {
    productIds[name] = await findOrCreateProduct(
      name,
      price,
      stock,
      catId,
      supplierId,
      auto,
      min,
      target,
      preferredId,
    );
  }
  console.log(
    `  ${productDefs.length} products with inventory settings (created or updated)`,
  );

  // ---- Purchase orders across every status ----
  // (Always inserted fresh — re-running the seed is meant to add another
  // realistic batch of orders, not silently skip them.)
  const poRows = [
    // Auto-created (matches what the system itself would generate for the two below-threshold auto-reorder products)
    [productIds["Corsair RM850x PSU"], supA, 17, "pending", "auto"],
    [productIds["Seagate Barracuda 4TB HDD"], supB, 40, "pending", "auto"],
    // Manual examples spanning the rest of the lifecycle
    [productIds["WD Black SN850X 1TB"], supB, 15, "approved", "manual"],
    [productIds["Corsair Vengeance 32GB DDR5"], supA, 10, "shipped", "manual"],
    [productIds["Corsair iCUE H150i Elite"], supA, 8, "delivered", "manual"],
    [productIds["ASUS ROG Strix Z790-E"], supA, 5, "cancelled", "manual"],
  ];
  for (const [productId, supplierId, qty, status, createdBy] of poRows) {
    await pool.query(
      `INSERT INTO purchase_orders (id, product_id, supplier_id, quantity, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), productId, supplierId, qty, status, createdBy],
    );
  }
  console.log(
    `  ${poRows.length} purchase orders (pending/approved/shipped/delivered/cancelled)`,
  );

  // ---- One fully-received PO, with its Restock History entry ----
  const receivedProductId = productIds["Noctua NF-A12x25 Fan"];
  const receivedPoId = uuidv4();
  await pool.query(
    `INSERT INTO purchase_orders (id, product_id, supplier_id, quantity, status, created_by)
     VALUES (?, ?, ?, 20, 'received', 'manual')`,
    [receivedPoId, receivedProductId, supC],
  );
  await pool.query(
    `INSERT INTO restock_history
       (id, product_id, purchase_order_id, quantity, previous_stock, new_stock, source)
     VALUES (?, ?, ?, 20, 20, 40, 'purchase_order')`,
    [uuidv4(), receivedProductId, receivedPoId],
  );

  // ---- One manual restock (no PO reference) ----
  const manualProductId = productIds["ASUS ROG Strix Z790-E"];
  await pool.query(
    `INSERT INTO restock_history
       (id, product_id, purchase_order_id, quantity, previous_stock, new_stock, source)
     VALUES (?, ?, NULL, 5, 2, 7, 'manual')`,
    [uuidv4(), manualProductId],
  );
  console.log("  2 restock history entries (1 via received PO, 1 manual)");

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
