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
  }
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
  updateProfile: (data: { full_name?: string; phone?: string; address?: string }) =>
    api.put("/auth/profile", data),
};

// Products
export const productsApi = {
  list: (params?: Record<string, string>) =>
    api.get("/products", { params }),
  builder: () => api.get("/products/builder"),
  get: (id: string) => api.get(`/products/${id}`),
  adminList: () => api.get("/admin/products"),
  create: (data: object) => api.post("/admin/products", data),
  update: (id: string, data: object) => api.put(`/admin/products/${id}`, data),
  delete: (id: string) => api.delete(`/admin/products/${id}`),
};

// Categories
export const categoriesApi = {
  list: () => api.get("/categories"),
  create: (data: object) => api.post("/categories", data),
  update: (id: string, data: object) => api.put(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
};

// Suppliers
export const suppliersApi = {
  list: () => api.get("/suppliers"),
  create: (data: object) => api.post("/suppliers", data),
  update: (id: string, data: object) => api.put(`/suppliers/${id}`, data),
  delete: (id: string) => api.delete(`/suppliers/${id}`),
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
  create: (data: { shippingAddress: string; paymentMethod: string }) =>
    api.post("/orders", data),
  adminList: () => api.get("/admin/orders"),
  updateStatus: (id: string, status: string) =>
    api.put(`/admin/orders/${id}/status`, { status }),
};
