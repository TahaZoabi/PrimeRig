# PrimeRig

A full-stack e-commerce platform for PC parts, with a built-in **compatibility-aware PC Builder**, a real **PayPal Sandbox checkout**, and an admin back office covering inventory replenishment, supplier purchase orders, and dashboard analytics.

Built with React, TypeScript, Node.js/Express, and MySQL.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the App](#running-the-app)
- [API Overview](#api-overview)
- [License](#license)

---

## Features

### Storefront
- Product catalog with search, category filters, and price/sort filters
- Product detail pages with live stock-aware add-to-cart
- Shopping cart with quantity limits enforced against real stock
- User authentication (JWT) with profile management

### PC Builder
- Component picker across 8 categories (CPU, GPU, Motherboard, RAM, Storage, PSU, Case, Cooler)
- **Two-layer compatibility system** built on a single shared rules engine:
  - **Preventive** — incompatible options are disabled *before* they can be selected, with the specific reason shown inline (e.g. "Requires AM5 socket", "GPU is too long for selected case")
  - **Final validation** — the whole build is re-checked before it's added to the cart
- A "Hide incompatible parts" toggle for browsing every option vs. only compatible ones
- Live running total and wattage estimate

### Checkout & Payments
- Real **PayPal Sandbox** integration (Orders v2 API) — the backend creates and captures the order server-side; the frontend never handles or sees the client secret
- Orders are only ever created after a verified PayPal capture — no way to bypass payment
- Idempotent capture handling (safe against duplicate callbacks/retries)

### Order Management
- Order status workflow: `processing → shipped → delivered` (or `cancelled`)
- Full order history for customers, with invoice print/PDF download
- Admin order details modal: customer info, shipping, payment, line items, and a real order status timeline

### Admin Dashboard
- Revenue, order, and customer KPIs across configurable time ranges (Today / 7d / 30d / 3m / 6m / 1y / All Time / custom range)
- Revenue & orders charts, new-customer trend, orders-by-status breakdown
- Top products, top categories, top suppliers, fastest-growing category
- New vs. returning customer breakdown, most active customer
- All calculations correctly exclude cancelled orders from revenue/unit metrics

### Inventory & Supplier Purchasing
- Per-product inventory settings: Auto Restock, Low Stock Threshold, Target Stock Level, Preferred Supplier
- Automatic Purchase Order creation when stock drops below threshold (Auto Restock only — never places a real order, just flags it for a human)
- Manual "Order From Supplier" action on any product
- Realistic supplier purchase-order lifecycle: **Pending → Sent to Supplier → Supplier Accepted → Supplier Shipped → Awaiting Delivery → Delivered**, simulated by the system — the admin only ever **Creates**, **Cancels**, or confirms **Goods Received**; inventory only increases on confirmed receipt
- Restock History log (manual and supplier-order-driven), Low Stock / Out of Stock views

### Catalog Management
- Archive/restore for products, categories, and suppliers (soft delete — past orders keep working)
- Duplicate-product detection on creation with an "increase existing stock instead" flow

---

## Tech Stack

**Frontend**
- React 18 + TypeScript + Vite
- TanStack React Query for data fetching/caching
- Tailwind CSS + Radix UI primitives (shadcn-style components)
- Recharts for dashboard charts
- jsPDF for invoice PDF generation

**Backend**
- Node.js + Express
- MySQL (via `mysql2`)
- JWT authentication + bcrypt password hashing
- `@paypal/checkout-server-sdk` for PayPal Sandbox integration

---

## Project Structure

```
PrimeRig/
├── backend/
│   └── src/
│       ├── controllers/     # Route handlers (auth, products, orders, payments, admin stats, ...)
│       ├── routes/          # Express route registration
│       ├── middleware/      # JWT auth guard, error handler
│       ├── utils/           # Order fulfillment, date-range helpers, PayPal client, activity log
│       ├── db.js            # MySQL connection pool
│       └── index.js         # App entry point
│
└── frontend/
    └── src/
        ├── pages/            # Route-level pages (Products, Cart, Checkout, PC Builder, Admin, ...)
        ├── components/admin/ # Admin dashboard, inventory, orders, products, categories, suppliers
        ├── components/ui/    # Shared UI primitives
        ├── hooks/            # React Query hooks (useCart, useOrders, usePayments, ...)
        └── lib/
            ├── api.ts               # Typed API client
            └── pcCompatibility.ts   # Single source of truth for PC Builder compatibility rules
```

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [MySQL](https://dev.mysql.com/downloads/) 8+
- A [PayPal Developer](https://developer.paypal.com/) account (free) for Sandbox credentials

### Installation

```bash
git clone https://github.com/TahaZoabi/PrimeRig.git
cd PrimeRig

cd backend && npm install
cd ../frontend && npm install
```

---

## Environment Variables

Create a `.env` file in **`backend/`**:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=pimerig

JWT_SECRET=change_this_to_a_long_random_string
JWT_EXPIRES_IN=7d

PORT=4000
CLIENT_URL=http://localhost:5173

# PayPal Sandbox — from developer.paypal.com > Apps & Credentials > Sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENV=sandbox
```

Create a `.env` file in **`frontend/`**:

```env
# Same Sandbox app's Client ID as above — this one is safe to expose to the browser.
# Never put PAYPAL_CLIENT_SECRET here.
VITE_PAYPAL_CLIENT_ID=
```

---

## Database Setup

Create the database:

```sql
CREATE DATABASE pimerig;
```

The application expects the following tables: `users`, `profiles`, `categories`, `suppliers`, `products`, `cart_items`, `orders`, `order_items`, `order_status_history`, `purchase_orders`, `restock_history`, `activity_log`.

> A seed script (`backend/src/auditSeed.js`) is included that populates realistic test data — customers with single and repeat orders, cancelled orders, low-stock/out-of-stock/archived products — useful for exercising every dashboard metric. Run it with:
> ```bash
> cd backend && node src/auditSeed.js
> ```

---

## Running the App

**Backend** (from `backend/`):
```bash
npm run dev     # nodemon, auto-restarts on change
npm start       # plain node
```
Runs on `http://localhost:4000`.

**Frontend** (from `frontend/`):
```bash
npm run dev
```
Runs on `http://localhost:5173`, with `/api` proxied to the backend.

**Production build:**
```bash
cd frontend && npm run build
```

---

## API Overview

All endpoints are mounted under `/api`. Admin-only endpoints require a JWT for a user with `role = 'admin'`.

| Area | Examples |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Products | `GET /products`, `GET /products/builder`, `POST /admin/products` |
| Categories / Suppliers | `GET /categories`, `GET /suppliers`, plus admin CRUD + restore |
| Cart | `GET /cart`, `POST /cart`, `PUT /cart/:itemId` |
| Orders | `GET /orders`, `GET /admin/orders`, `GET /admin/orders/:id`, `PUT /admin/orders/:id/status` |
| Payments | `POST /payments/paypal/create-order`, `POST /payments/paypal/capture-order` |
| Purchase Orders | `POST /admin/purchase-orders`, `PUT /admin/purchase-orders/:id/{cancel,simulate-progress,receive}` |
| Inventory | `GET /admin/inventory/overview`, `GET /admin/restock-history` |
| Dashboard | `GET /admin/stats?period=...`, `GET /admin/activity` |

---

## License

This project was built as an academic final project. No license has been specified — all rights reserved by the author unless a license is added.
