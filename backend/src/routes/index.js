/**
 * routes/index.js
 *
 * Registers all API routes.
 * Mounted at /api in src/index.js
 */

const router = require("express").Router();
const { authenticate, requireAdmin } = require("../middleware/auth");

// --- Controllers ---
const auth = require("../controllers/authController");
const products = require("../controllers/productsController");
const categories = require("../controllers/categoriesController");
const suppliers = require("../controllers/suppliersController");
const cart = require("../controllers/cartController");
const orders = require("../controllers/ordersController");
const adminStats = require("../controllers/adminStatsController");
const activity = require("../controllers/activityController");
const payments = require("../controllers/paymentsController");
const purchaseOrders = require("../controllers/purchaseOrdersController");
const inventory = require("../controllers/inventoryController");

// ============================================================
// AUTH ROUTES
// ============================================================
router.post("/auth/register", auth.register);
router.post("/auth/login", auth.login);
router.get("/auth/me", authenticate, auth.getMe);
router.put("/auth/profile", authenticate, auth.updateProfile);

// ============================================================
// PRODUCT ROUTES
// ============================================================
// Public routes
router.get("/products", products.getProducts);
router.get("/products/builder", products.getBuilderProducts);
router.get("/products/:id", products.getProduct);

// Admin routes  (admin must come after public to avoid matching "builder" as an :id)
router.get(
  "/admin/products",
  authenticate,
  requireAdmin,
  products.getAdminProducts,
);
router.post(
  "/admin/products",
  authenticate,
  requireAdmin,
  products.createProduct,
);
router.put(
  "/admin/products/:id",
  authenticate,
  requireAdmin,
  products.updateProduct,
);
router.delete(
  "/admin/products/:id",
  authenticate,
  requireAdmin,
  products.deleteProduct,
);
router.put(
  "/admin/products/:id/restore",
  authenticate,
  requireAdmin,
  products.restoreProduct,
);

// ============================================================
// CATEGORIES ROUTES
// ============================================================
router.get("/categories", categories.getCategories);
router.get(
  "/admin/categories",
  authenticate,
  requireAdmin,
  categories.getAdminCategories,
);
router.post(
  "/categories",
  authenticate,
  requireAdmin,
  categories.createCategory,
);
router.put(
  "/categories/:id",
  authenticate,
  requireAdmin,
  categories.updateCategory,
);
router.delete(
  "/categories/:id",
  authenticate,
  requireAdmin,
  categories.deleteCategory,
);
router.put(
  "/admin/categories/:id/restore",
  authenticate,
  requireAdmin,
  categories.restoreCategory,
);

// ============================================================
// SUPPLIERS ROUTES
// ============================================================
router.get("/suppliers", suppliers.getSuppliers);
router.get(
  "/admin/suppliers",
  authenticate,
  requireAdmin,
  suppliers.getAdminSuppliers,
);
router.post("/suppliers", authenticate, requireAdmin, suppliers.createSupplier);
router.put(
  "/suppliers/:id",
  authenticate,
  requireAdmin,
  suppliers.updateSupplier,
);
router.delete(
  "/suppliers/:id",
  authenticate,
  requireAdmin,
  suppliers.deleteSupplier,
);
router.put(
  "/admin/suppliers/:id/restore",
  authenticate,
  requireAdmin,
  suppliers.restoreSupplier,
);

// ============================================================
// CART ROUTES (all authenticated)
// ============================================================
router.get("/cart", authenticate, cart.getCart);
router.post("/cart", authenticate, cart.addToCart);
router.put("/cart/:itemId", authenticate, cart.updateCartItem);
router.delete("/cart", authenticate, cart.clearCart);

// ============================================================
// ORDER ROUTES
// ============================================================
router.get("/orders", authenticate, orders.getMyOrders);
router.get("/admin/orders", authenticate, requireAdmin, orders.getAllOrders);
router.get(
  "/admin/orders/:id",
  authenticate,
  requireAdmin,
  orders.getOrderDetails,
);
router.put(
  "/admin/orders/:id/status",
  authenticate,
  requireAdmin,
  orders.updateOrderStatus,
);

// ============================================================
// PURCHASE ORDERS (inventory replenishment)
// ============================================================
router.get(
  "/admin/purchase-orders",
  authenticate,
  requireAdmin,
  purchaseOrders.getPurchaseOrders,
);
router.post(
  "/admin/purchase-orders",
  authenticate,
  requireAdmin,
  purchaseOrders.createPurchaseOrder,
);
router.put(
  "/admin/purchase-orders/:id/cancel",
  authenticate,
  requireAdmin,
  purchaseOrders.cancelPurchaseOrder,
);
router.put(
  "/admin/purchase-orders/:id/simulate-progress",
  authenticate,
  requireAdmin,
  purchaseOrders.simulateSupplierProgress,
);
router.put(
  "/admin/purchase-orders/:id/receive",
  authenticate,
  requireAdmin,
  purchaseOrders.receivePurchaseOrder,
);

// ============================================================
// INVENTORY OVERVIEW + RESTOCK HISTORY
// ============================================================
router.get(
  "/admin/inventory/overview",
  authenticate,
  requireAdmin,
  inventory.getInventoryOverview,
);
router.get(
  "/admin/restock-history",
  authenticate,
  requireAdmin,
  inventory.getRestockHistory,
);

// ============================================================
// PAYPAL PAYMENTS
// ============================================================
// Replaces the old direct "POST /orders" simulated-checkout endpoint. An
// order is now only ever created after the backend verifies a real PayPal
// capture (see paymentsController.js) — there is no longer a way to create
// an order without going through PayPal.
router.post(
  "/payments/paypal/create-order",
  authenticate,
  payments.createPaypalOrder,
);
router.post(
  "/payments/paypal/capture-order",
  authenticate,
  payments.capturePaypalOrder,
);

// ============================================================
// ADMIN DASHBOARD STATS
// ============================================================
router.get(
  "/admin/stats",
  authenticate,
  requireAdmin,
  adminStats.getDashboardStats,
);

// ============================================================
// RECENT ACTIVITY
// ============================================================
router.get(
  "/admin/activity",
  authenticate,
  requireAdmin,
  activity.getRecentActivity,
);

module.exports = router;
