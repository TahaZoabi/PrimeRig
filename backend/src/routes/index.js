/**
 * routes/index.js
 *
 * Registers all API routes.
 * Mounted at /api in src/index.js
 */

const router = require("express").Router();
const { authenticate, requireAdmin } = require("../middleware/auth");

// --- Controllers ---
const auth       = require("../controllers/authController");
const products   = require("../controllers/productsController");
const categories = require("../controllers/categoriesController");
const suppliers  = require("../controllers/suppliersController");
const cart       = require("../controllers/cartController");
const orders     = require("../controllers/ordersController");

// ============================================================
// AUTH ROUTES
// ============================================================
router.post("/auth/register", auth.register);
router.post("/auth/login",    auth.login);
router.get ("/auth/me",       authenticate, auth.getMe);
router.put ("/auth/profile",  authenticate, auth.updateProfile);

// ============================================================
// PRODUCT ROUTES
// ============================================================
// Public routes
router.get("/products",          products.getProducts);
router.get("/products/builder",  products.getBuilderProducts);
router.get("/products/:id",      products.getProduct);

// Admin routes  (admin must come after public to avoid matching "builder" as an :id)
router.get   ("/admin/products",     authenticate, requireAdmin, products.getAdminProducts);
router.post  ("/admin/products",     authenticate, requireAdmin, products.createProduct);
router.put   ("/admin/products/:id", authenticate, requireAdmin, products.updateProduct);
router.delete("/admin/products/:id", authenticate, requireAdmin, products.deleteProduct);

// ============================================================
// CATEGORIES ROUTES
// ============================================================
router.get   ("/categories",      categories.getCategories);
router.post  ("/categories",      authenticate, requireAdmin, categories.createCategory);
router.put   ("/categories/:id",  authenticate, requireAdmin, categories.updateCategory);
router.delete("/categories/:id",  authenticate, requireAdmin, categories.deleteCategory);

// ============================================================
// SUPPLIERS ROUTES
// ============================================================
router.get   ("/suppliers",      suppliers.getSuppliers);
router.post  ("/suppliers",      authenticate, requireAdmin, suppliers.createSupplier);
router.put   ("/suppliers/:id",  authenticate, requireAdmin, suppliers.updateSupplier);
router.delete("/suppliers/:id",  authenticate, requireAdmin, suppliers.deleteSupplier);

// ============================================================
// CART ROUTES (all authenticated)
// ============================================================
router.get   ("/cart",            authenticate, cart.getCart);
router.post  ("/cart",            authenticate, cart.addToCart);
router.put   ("/cart/:itemId",    authenticate, cart.updateCartItem);
router.delete("/cart",            authenticate, cart.clearCart);

// ============================================================
// ORDER ROUTES
// ============================================================
router.get ("/orders",                    authenticate, orders.getMyOrders);
router.post("/orders",                    authenticate, orders.createOrder);
router.get ("/admin/orders",              authenticate, requireAdmin, orders.getAllOrders);
router.put ("/admin/orders/:id/status",   authenticate, requireAdmin, orders.updateOrderStatus);

module.exports = router;
