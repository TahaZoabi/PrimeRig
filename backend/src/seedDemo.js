/**
 * seedDemo.js
 *
 * Generates realistic demo data so the Admin Dashboard has enough history
 * to actually demonstrate itself — customers, categories, suppliers,
 * products (including some low-stock/out-of-stock/never-sold ones), and a
 * spread of orders across today, this week, this month, the last 3 months,
 * and the last year, with a realistic mix of order statuses.
 *
 * Intended for a fresh/dev database, NOT production — it inserts new rows
 * unconditionally rather than upserting. Run once with:
 *   node src/seedDemo.js
 * or, if you added the npm script:
 *   npm run seed:demo
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const pool = require("./db");

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const daysAgo = (n, hour = rand(8, 21)) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, rand(0, 59), 0, 0);
  return d;
};
// "Today" orders must land strictly in the past relative to right now (not
// just today's calendar date), or the dashboard's "today" window — which
// runs from midnight up to the current moment — would miss them.
const minutesAgo = (n) => new Date(Date.now() - n * 60 * 1000);

async function main() {
  console.log("Seeding demo data...");

  // ---- Admin + customers ----
  const adminPass = await bcrypt.hash("admin1234", 10);
  const adminId = uuidv4();
  await pool.query(
    "INSERT INTO users (id, email, password, full_name, role) VALUES (?, ?, ?, ?, 'admin')",
    [adminId, "admin@primerig.com", adminPass, "Store Admin"],
  );

  const customerNames = [
    "John Carter",
    "Emma Watson",
    "Liam Chen",
    "Sofia Rossi",
    "Noah Kim",
    "Olivia Brown",
    "Ethan Davis",
    "Ava Martinez",
    "Mason Lee",
    "Isabella Wilson",
    "Lucas Anderson",
    "Mia Thompson",
    "James Nguyen",
    "Charlotte Garcia",
  ];
  const custPass = await bcrypt.hash("password123", 10);
  const customers = [];
  for (const name of customerNames) {
    const id = uuidv4();
    const email = name.toLowerCase().replace(" ", ".") + "@example.com";
    await pool.query(
      "INSERT INTO users (id, email, password, full_name, role) VALUES (?, ?, ?, ?, 'user')",
      [id, email, custPass, name],
    );
    customers.push({ id, name });
  }
  console.log(`  ${customers.length} customers`);

  // ---- Categories ----
  const categoryDefs = [
    ["CPU", "Processors for every build"],
    ["GPU", "Graphics cards"],
    ["RAM", "Memory modules"],
    ["Storage", "SSDs and hard drives"],
    ["Power Supply", "PSUs"],
    ["Motherboard", "Mainboards for every socket"],
    ["Cooling", "Air and liquid cooling"],
  ];
  const categories = [];
  for (const [name, description] of categoryDefs) {
    const id = uuidv4();
    await pool.query(
      "INSERT INTO categories (id, name, description) VALUES (?, ?, ?)",
      [id, name, description],
    );
    categories.push({ id, name });
  }
  console.log(`  ${categories.length} categories`);

  // ---- Suppliers ----
  const supplierDefs = [
    ["Intel Direct", "Processors"],
    ["AMD Direct", "Processors & Graphics"],
    ["NVIDIA Direct", "Graphics Cards"],
    ["Corsair Supply Co", "Memory, PSU, Cooling"],
    ["Western Digital", "Storage"],
    ["Noctua Distribution", "Cooling"],
  ];
  const suppliers = [];
  for (const [name, specialization] of supplierDefs) {
    const id = uuidv4();
    await pool.query(
      "INSERT INTO suppliers (id, name, specialization) VALUES (?, ?, ?)",
      [id, name, specialization],
    );
    suppliers.push({ id, name });
  }
  console.log(`  ${suppliers.length} suppliers`);

  const catId = (name) => categories.find((c) => c.name === name).id;
  const supId = (name) => suppliers.find((s) => s.name === name).id;

  // ---- Products ----
  // [name, category, supplier, price, stock]
  // A handful deliberately at 0 (out of stock) or <=5 (low stock), and a
  // couple with healthy stock but never referenced by any order (never sold).
  const productDefs = [
    ["Intel Core i9-14900K", "CPU", "Intel Direct", 589.99, 12],
    ["Intel Core i5-14600K", "CPU", "Intel Direct", 319.99, 4],
    ["AMD Ryzen 9 7950X3D", "CPU", "AMD Direct", 699.99, 8],
    ["AMD Ryzen 5 7600X", "CPU", "AMD Direct", 249.99, 0],
    ["NVIDIA RTX 4090", "GPU", "NVIDIA Direct", 1599.99, 3],
    ["NVIDIA RTX 4070 Super", "GPU", "NVIDIA Direct", 599.99, 10],
    ["AMD Radeon RX 7800 XT", "GPU", "AMD Direct", 499.99, 6],
    ["NVIDIA RTX 4060", "GPU", "NVIDIA Direct", 299.99, 0],
    ["Corsair Vengeance 32GB DDR5", "RAM", "Corsair Supply Co", 109.99, 20],
    ["Corsair Vengeance 16GB DDR4", "RAM", "Corsair Supply Co", 54.99, 2],
    ["G.Skill Trident Z5 64GB", "RAM", "Corsair Supply Co", 249.99, 5],
    ["Samsung 990 Pro 2TB NVMe", "Storage", "Western Digital", 149.99, 15],
    ["WD Black SN850X 1TB", "Storage", "Western Digital", 89.99, 1],
    ["Seagate Barracuda 4TB HDD", "Storage", "Western Digital", 79.99, 25],
    ["Corsair RM850x PSU", "Power Supply", "Corsair Supply Co", 139.99, 9],
    ["Corsair RM1000x PSU", "Power Supply", "Corsair Supply Co", 189.99, 0],
    ["ASUS ROG Strix Z790-E", "Motherboard", "Intel Direct", 449.99, 7],
    ["MSI MAG B650 Tomahawk", "Motherboard", "AMD Direct", 219.99, 3],
    ["Noctua NH-D15", "Cooling", "Noctua Distribution", 109.99, 14],
    ["Corsair iCUE H150i Elite", "Cooling", "Corsair Supply Co", 179.99, 6],
    // Never sold — healthy stock, no orders will ever reference these
    ["ASUS TUF Gaming B760", "Motherboard", "Intel Direct", 189.99, 18],
    ["Noctua NF-A12x25 Fan", "Cooling", "Noctua Distribution", 29.99, 40],
  ];

  const products = [];
  for (const [name, category, supplier, price, stock] of productDefs) {
    const id = uuidv4();
    await pool.query(
      "INSERT INTO products (id, name, price, stock, category_id, supplier_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)",
      [id, name, price, stock, catId(category), supId(supplier), 1],
    );
    products.push({ id, name, price });
  }
  console.log(`  ${products.length} products`);

  // Products intentionally left "never sold": the last two in productDefs.
  const sellableProducts = products.slice(0, products.length - 2);

  // ---- Orders spread across realistic time windows ----
  // Roughly: today, yesterday, this week, this month, last 3 months, last year.
  const windows = [
    { offsetRange: [0, 0], count: 3 }, // today
    { offsetRange: [1, 1], count: 2 }, // yesterday
    { offsetRange: [2, 6], count: 8 }, // rest of this week
    { offsetRange: [7, 29], count: 20 }, // rest of this month
    { offsetRange: [30, 89], count: 35 }, // last 3 months
    { offsetRange: [90, 179], count: 30 }, // 3-6 months ago
    { offsetRange: [180, 364], count: 40 }, // 6-12 months ago
  ];
  const statusPool = [
    ...Array(60).fill("delivered"),
    ...Array(15).fill("pending"),
    ...Array(10).fill("processing"),
    ...Array(8).fill("shipped"),
    ...Array(7).fill("cancelled"),
  ];

  let orderCount = 0;
  for (const w of windows) {
    for (let i = 0; i < w.count; i++) {
      const offset = rand(w.offsetRange[0], w.offsetRange[1]);
      const createdAt =
        offset === 0 ? minutesAgo(rand(5, 300)) : daysAgo(offset);
      // Recent orders skew toward pending/processing (still in flight);
      // older orders are overwhelmingly delivered or cancelled.
      const status =
        offset <= 2
          ? pick(["pending", "processing", "pending", "delivered"])
          : pick(statusPool);

      const customer = pick(customers);
      const itemCount = rand(1, 3);
      const chosenProducts = new Set();
      while (chosenProducts.size < itemCount) {
        chosenProducts.add(pick(sellableProducts));
      }

      let total = 0;
      const items = [];
      chosenProducts.forEach((p) => {
        const qty = rand(1, 2);
        total += p.price * qty;
        items.push({ productId: p.id, qty, price: p.price });
      });

      const orderId = uuidv4();
      await pool.query(
        "INSERT INTO orders (id, user_id, total, status, created_at) VALUES (?, ?, ?, ?, ?)",
        [orderId, customer.id, total.toFixed(2), status, createdAt],
      );
      for (const item of items) {
        await pool.query(
          "INSERT INTO order_items (id, order_id, product_id, quantity, price) VALUES (?, ?, ?, ?, ?)",
          [uuidv4(), orderId, item.productId, item.qty, item.price],
        );
      }
      orderCount += 1;
    }
  }
  console.log(
    `  ${orderCount} orders with order_items, spread across the last year`,
  );

  // ---- A handful of realistic activity log entries ----
  const activities = [
    [
      "order",
      `Customer ${pick(customerNames)} placed order #${uuidv4().slice(0, 8).toUpperCase()}`,
    ],
    ["category", 'Category "Cooling" was added'],
    ["product", 'Product "NVIDIA RTX 4090" was updated'],
    ["supplier", 'Supplier "Noctua Distribution" was added'],
    ["product", 'Product "AMD Ryzen 5 7600X" was archived'],
    ["product", 'Product "AMD Ryzen 5 7600X" was restored'],
    ["order", `Order #${uuidv4().slice(0, 8).toUpperCase()} was cancelled`],
  ];
  for (const [type, message] of activities) {
    await pool.query(
      "INSERT INTO activity_log (id, type, message) VALUES (?, ?, ?)",
      [uuidv4(), type, message],
    );
  }
  console.log(`  ${activities.length} activity log entries`);

  console.log("\nDone. Admin login: admin@primerig.com / admin1234");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
