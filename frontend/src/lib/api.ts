/**
 * lib/api.ts
 *
 * Configured Axios instance that:
 * - Points to the Express backend at /api
 * - Automatically attaches the JWT from localStorage
 * - Provides typed helper functions for each resource
 */

import axios from "axios";

// Base URL — uses Vite proxy in dev ("/api" → "http://localhost:4000/api")
const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor: attach JWT ──────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor: handle 401 ────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
    }
    return Promise.reject(err);
  },
);

export default api;

// ── Typed API helpers ─────────────────────────────────────────

// Auth
export const authApi = {
  register: (data: { email: string; password: string; full_name?: string }) =>
    api.post("/auth/register", data),
  login: (data: { email: string; password: string }) =>
    api.post("/auth/login", data),
  me: () => api.get("/auth/me"),
  updateProfile: (data: {
    full_name?: string;
    phone?: string;
    address?: string;
  }) => api.put("/auth/profile", data),
};

// Products
export const productsApi = {
  list: (params?: Record<string, string>) => api.get("/products", { params }),
  builder: () => api.get("/products/builder"),
  get: (id: string) => api.get(`/products/${id}`),
  adminList: () => api.get("/admin/products"),
  create: (data: object) => api.post("/admin/products", data),
  update: (id: string, data: object) => api.put(`/admin/products/${id}`, data),
  delete: (id: string) => api.delete(`/admin/products/${id}`),
  restore: (id: string) => api.put(`/admin/products/${id}/restore`),
};

// Categories
export const categoriesApi = {
  list: () => api.get("/categories"),
  adminList: () => api.get("/admin/categories"),
  create: (data: object) => api.post("/categories", data),
  update: (id: string, data: object) => api.put(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
  restore: (id: string) => api.put(`/admin/categories/${id}/restore`),
};

// Suppliers
export const suppliersApi = {
  list: () => api.get("/suppliers"),
  adminList: () => api.get("/admin/suppliers"),
  create: (data: object) => api.post("/suppliers", data),
  update: (id: string, data: object) => api.put(`/suppliers/${id}`, data),
  delete: (id: string) => api.delete(`/suppliers/${id}`),
  restore: (id: string) => api.put(`/admin/suppliers/${id}/restore`),
};

// Cart
export const cartApi = {
  get: () => api.get("/cart"),
  add: (productId: string, quantity = 1) =>
    api.post("/cart", { productId, quantity }),
  update: (itemId: string, quantity: number) =>
    api.put(`/cart/${itemId}`, { quantity }),
  clear: () => api.delete("/cart"),
};

// Orders
export const ordersApi = {
  myOrders: () => api.get("/orders"),
  adminList: (params?: {
    period?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }) => api.get("/admin/orders", { params }),
  getDetails: (id: string) => api.get(`/admin/orders/${id}`),
  updateStatus: (id: string, status: string) =>
    api.put(`/admin/orders/${id}/status`, { status }),
};

// Purchase orders — internal inventory-replenishment records only, never a
// real purchase from a supplier.
export const purchaseOrdersApi = {
  list: (status?: string) =>
    api.get("/admin/purchase-orders", { params: status ? { status } : {} }),
  create: (data: {
    product_id: string;
    supplier_id?: string;
    quantity: number;
  }) => api.post("/admin/purchase-orders", data),
  cancel: (id: string) => api.put(`/admin/purchase-orders/${id}/cancel`),
  simulateProgress: (id: string) =>
    api.put(`/admin/purchase-orders/${id}/simulate-progress`),
  receive: (id: string) => api.put(`/admin/purchase-orders/${id}/receive`),
};

// Inventory overview + restock history
export const inventoryApi = {
  overview: () => api.get("/admin/inventory/overview"),
  restockHistory: () => api.get("/admin/restock-history"),
};

// PayPal payments — the only way an order is created now. The backend
// verifies the payment with PayPal itself before an order ever exists.
export const paymentsApi = {
  createPaypalOrder: () => api.post("/payments/paypal/create-order", {}),
  capturePaypalOrder: (data: { orderID: string; shippingAddress: string }) =>
    api.post("/payments/paypal/capture-order", data),
};

// Admin dashboard stats
export const adminStatsApi = {
  get: (params: { period: string; startDate?: string; endDate?: string }) =>
    api.get("/admin/stats", { params }),
};

// Recent activity feed
export const activityApi = {
  get: (limit = 20) => api.get("/admin/activity", { params: { limit } }),
};
