/**
 * controllers/adminStatsController.js
 *
 * Aggregated statistics for the Admin Dashboard.
 * All calculations run as SQL aggregates on the backend — the frontend
 * never fetches raw order/product lists to compute these itself.
 *
 * GET /api/admin/stats?period=today|7d|30d|3m|6m|1y|all|custom[&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD]
 */

const pool = require("../db");
const {
  PERIODS,
  DAY_MS,
  resolveRange,
  InvalidRangeError,
} = require("../utils/dateRange");

/**
 * Quick "who sold the most units" lookup for a fixed window, independent of
 * the dashboard's selected period. Used for the Today/Week/Month/All-Time
 * top-product quick-insight row.
 */
async function topProductForWindow(period) {
  const { start, end } = resolveRange(period);
  const rangeSql = start
    ? "o.created_at >= ? AND o.created_at <= ?"
    : "o.created_at <= ?";
  const params = start ? [start, end] : [end];

  const [[row]] = await pool.query(
    `SELECT p.name, SUM(oi.quantity) AS unitsSold
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     WHERE ${rangeSql}
     GROUP BY p.id, p.name
     ORDER BY unitsSold DESC
     LIMIT 1`,
    params,
  );
  return row ? { name: row.name, unitsSold: Number(row.unitsSold) } : null;
}

/**
 * GET /api/admin/stats  (admin)
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const { period = "30d", startDate, endDate } = req.query;

    if (!PERIODS.includes(period)) {
      return res.status(400).json({ error: "Invalid period" });
    }
    if (period === "custom" && (!startDate || !endDate)) {
      return res.status(400).json({
        error: "startDate and endDate are required for a custom range",
      });
    }

    let start, end, prevStart, prevEnd;
    try {
      ({ start, end, prevStart, prevEnd } = resolveRange(
        period,
        startDate,
        endDate,
      ));
    } catch (e) {
      if (e instanceof InvalidRangeError) {
        return res.status(e.status).json({ error: e.message });
      }
      throw e;
    }

    // Shared WHERE-clause fragment for "current period", parameterized once.
    // col is qualified per-query ("created_at" vs "o.created_at") to avoid ambiguity.
    const rangeSql = (col) =>
      start ? `${col} >= ? AND ${col} <= ?` : `${col} <= ?`;
    const rangeParams = start ? [start, end] : [end];

    // ---- Summary: revenue, order count, highest/lowest, pending/completed ----
    const [[summaryRow]] = await pool.query(
      `SELECT
         COALESCE(SUM(total), 0)                                AS revenue,
         COUNT(*)                                                AS orderCount,
         COALESCE(MAX(total), 0)                                AS highestOrder,
         COALESCE(MIN(total), 0)                                AS lowestOrder,
         SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END)   AS pendingOrders,
         SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)   AS completedOrders
       FROM orders
       WHERE ${rangeSql("created_at")}`,
      rangeParams,
    );

    // ---- Products sold in range ----
    const [[soldRow]] = await pool.query(
      `SELECT COALESCE(SUM(oi.quantity), 0) AS productsSold
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE ${rangeSql("o.created_at")}`,
      rangeParams,
    );

    // ---- Previous-period revenue, for the growth % ----
    let revenueGrowthPct = null;
    if (prevStart) {
      const [[prevRow]] = await pool.query(
        `SELECT COALESCE(SUM(total), 0) AS revenue FROM orders WHERE created_at >= ? AND created_at < ?`,
        [prevStart, prevEnd],
      );
      const prevRevenue = Number(prevRow.revenue);
      if (prevRevenue > 0) {
        revenueGrowthPct =
          ((Number(summaryRow.revenue) - prevRevenue) / prevRevenue) * 100;
      }
    }

    // ---- Top 5 selling products in range ----
    const [topProducts] = await pool.query(
      `SELECT p.id, p.name, SUM(oi.quantity) AS unitsSold, SUM(oi.quantity * oi.price) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE ${rangeSql("o.created_at")}
       GROUP BY p.id, p.name
       ORDER BY unitsSold DESC
       LIMIT 5`,
      rangeParams,
    );

    // ---- Sales by category in range (units + revenue, for two different "best" views) ----
    const [categorySales] = await pool.query(
      `SELECT c.id, c.name, SUM(oi.quantity) AS unitsSold, SUM(oi.quantity * oi.price) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       JOIN categories c ON c.id = p.category_id
       WHERE ${rangeSql("o.created_at")}
       GROUP BY c.id, c.name
       ORDER BY unitsSold DESC
       LIMIT 8`,
      rangeParams,
    );

    // ---- Top 5 suppliers in range, by units sold ----
    const [topSuppliers] = await pool.query(
      `SELECT s.id, s.name, SUM(oi.quantity) AS unitsSold, SUM(oi.quantity * oi.price) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       JOIN suppliers s ON s.id = p.supplier_id
       WHERE ${rangeSql("o.created_at")}
       GROUP BY s.id, s.name
       ORDER BY unitsSold DESC
       LIMIT 5`,
      rangeParams,
    );

    // ---- Orders by status, in range ----
    const [ordersByStatusRows] = await pool.query(
      `SELECT status, COUNT(*) AS count
       FROM orders
       WHERE ${rangeSql("created_at")}
       GROUP BY status`,
      rangeParams,
    );

    // ---- Most active customer in range (by order count, tiebreak by spend) ----
    const [[mostActive]] = await pool.query(
      `SELECT u.id, u.full_name, u.email, COUNT(*) AS orderCount, SUM(o.total) AS totalSpent
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE ${rangeSql("o.created_at")}
       GROUP BY u.id, u.full_name, u.email
       ORDER BY orderCount DESC, totalSpent DESC
       LIMIT 1`,
      rangeParams,
    );

    // ---- New vs. returning customers (+ bucketed new-customers-over-time) ----
    // Definition (derived from the orders table only — the users table has no
    // signup-date column available to us): a customer is "new" in this period
    // if their earliest order OVERALL falls inside the period; "returning" if
    // they have an order in the period AND an earlier order before it started.
    let newCustomers = 0;
    let returningCustomers = 0;
    const newCustomerDates = [];
    {
      const [firstOrders] = await pool.query(
        `SELECT user_id, MIN(created_at) AS firstOrderAt
         FROM orders
         WHERE user_id IN (
           SELECT DISTINCT user_id FROM orders WHERE ${rangeSql("created_at")}
         )
         GROUP BY user_id`,
        rangeParams,
      );
      const periodStartMs = start ? start.getTime() : -Infinity;
      firstOrders.forEach((row) => {
        const firstMs = new Date(row.firstOrderAt).getTime();
        if (firstMs >= periodStartMs) {
          newCustomers += 1;
          newCustomerDates.push(new Date(row.firstOrderAt));
        } else {
          returningCustomers += 1;
        }
      });
    }

    // ---- Daily/monthly series for the charts ----
    let seriesStart = start;
    if (!seriesStart) {
      const [[earliest]] = await pool.query(
        `SELECT MIN(created_at) AS min FROM orders`,
      );
      seriesStart = earliest.min
        ? new Date(earliest.min)
        : new Date(end.getTime() - 30 * DAY_MS);
    }
    const daysDiff = Math.max(
      1,
      Math.ceil((end.getTime() - seriesStart.getTime()) / DAY_MS),
    );
    const granularity = daysDiff > 120 ? "month" : "day";
    const bucketExpr =
      granularity === "month"
        ? "DATE_FORMAT(created_at, '%Y-%m-01')"
        : "DATE(created_at)";
    const bucketKey = (d) =>
      granularity === "month"
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
        : d.toISOString().slice(0, 10);

    const [series] = await pool.query(
      `SELECT ${bucketExpr} AS bucket, COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders
       FROM orders
       WHERE ${rangeSql("created_at")}
       GROUP BY bucket
       ORDER BY bucket ASC`,
      rangeParams,
    );

    // Bucket the new-customer first-order dates the same way, so the chart
    // lines up with the revenue/orders series.
    const newCustomersByBucket = {};
    newCustomerDates.forEach((d) => {
      const key = bucketKey(d);
      newCustomersByBucket[key] = (newCustomersByBucket[key] || 0) + 1;
    });
    const newCustomersSeries = series.map((row) => {
      const key =
        row.bucket instanceof Date
          ? row.bucket.toISOString().slice(0, 10)
          : String(row.bucket).slice(0, 10);
      return { date: key, newCustomers: newCustomersByBucket[key] || 0 };
    });

    // ---- Recent orders (bounded, within range) ----
    const [recentOrders] = await pool.query(
      `SELECT o.id, o.status, o.total, o.created_at,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS itemCount
       FROM orders o
       WHERE ${rangeSql("o.created_at")}
       ORDER BY o.created_at DESC
       LIMIT 6`,
      rangeParams,
    );

    // ---- Inventory state (current stock levels — not period-scoped) ----
    const [[{ totalProducts }]] = await pool.query(
      `SELECT COUNT(*) AS totalProducts FROM products WHERE is_active = 1`,
    );
    const [lowStockRows] = await pool.query(
      `SELECT p.id, p.name, p.stock, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       WHERE p.is_active = 1 AND p.stock <= 5
       ORDER BY p.stock ASC
       LIMIT 15`,
    );

    // ---- All-time totals (never period-scoped — these describe the whole business) ----
    const [[allTimeOrders]] = await pool.query(
      `SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orderCount FROM orders`,
    );
    const [[{ totalCustomers }]] = await pool.query(
      `SELECT COUNT(*) AS totalCustomers FROM users WHERE role = 'user'`,
    );
    const [[productCounts]] = await pool.query(
      `SELECT
         SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS archived
       FROM products`,
    );
    const [[categoryCounts]] = await pool.query(
      `SELECT
         SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS archived
       FROM categories`,
    );
    const [[supplierCounts]] = await pool.query(
      `SELECT
         SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS archived
       FROM suppliers`,
    );

    // ---- Products that have never been sold (all-time, active catalog only) ----
    const [[{ neverSoldCount }]] = await pool.query(
      `SELECT COUNT(*) AS neverSoldCount
       FROM products p
       WHERE p.is_active = 1
         AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id)`,
    );
    const [neverSoldRows] = await pool.query(
      `SELECT p.id, p.name, p.created_at
       FROM products p
       WHERE p.is_active = 1
         AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id)
       ORDER BY p.created_at ASC
       LIMIT 5`,
    );

    // ---- Fastest-growing category (period-over-period, only when there's a comparable previous period) ----
    let fastestGrowingCategory = null;
    if (prevStart) {
      const [prevCategorySales] = await pool.query(
        `SELECT c.id, SUM(oi.quantity * oi.price) AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         JOIN categories c ON c.id = p.category_id
         WHERE o.created_at >= ? AND o.created_at < ?
         GROUP BY c.id`,
        [prevStart, prevEnd],
      );
      const prevRevenueById = {};
      prevCategorySales.forEach((row) => {
        prevRevenueById[row.id] = Number(row.revenue);
      });
      let best = null;
      categorySales.forEach((c) => {
        const prevRevenue = prevRevenueById[c.id] || 0;
        const currRevenue = Number(c.revenue);
        if (prevRevenue > 0) {
          const growthPct = ((currRevenue - prevRevenue) / prevRevenue) * 100;
          if (!best || growthPct > best.growthPct) {
            best = { id: c.id, name: c.name, growthPct };
          }
        }
      });
      fastestGrowingCategory = best;
    }

    // ---- Quick-insight top product by fixed windows (independent of selected period) ----
    const [todayTop, weekTop, monthTop, allTimeTop] = await Promise.all([
      topProductForWindow("today"),
      topProductForWindow("7d"),
      topProductForWindow("30d"),
      topProductForWindow("all"),
    ]);

    const orderCount = Number(summaryRow.orderCount);
    const revenue = Number(summaryRow.revenue);
    const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0;

    const topProductsMapped = topProducts.map((p) => ({
      id: p.id,
      name: p.name,
      unitsSold: Number(p.unitsSold),
      revenue: Number(p.revenue),
    }));
    const categorySalesMapped = categorySales.map((c) => ({
      id: c.id,
      name: c.name,
      unitsSold: Number(c.unitsSold),
      revenue: Number(c.revenue),
    }));

    const ordersByStatus = {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };
    ordersByStatusRows.forEach((row) => {
      if (row.status in ordersByStatus) {
        ordersByStatus[row.status] = Number(row.count);
      }
    });

    res.json({
      period,
      range: {
        start: start ? start.toISOString() : null,
        end: end.toISOString(),
      },
      summary: {
        revenue,
        orderCount,
        productsSold: Number(soldRow.productsSold),
        avgOrderValue,
        highestOrder: Number(summaryRow.highestOrder),
        lowestOrder: Number(summaryRow.lowestOrder),
        pendingOrders: Number(summaryRow.pendingOrders),
        completedOrders: Number(summaryRow.completedOrders),
        revenuePerDay: revenue / daysDiff,
        ordersPerDay: orderCount / daysDiff,
      },
      // All-time totals — always the same regardless of the selected period,
      // so the dashboard can show "Total Revenue" alongside "Revenue (period)".
      totals: {
        revenueAllTime: Number(allTimeOrders.revenue),
        ordersAllTime: Number(allTimeOrders.orderCount),
        totalCustomers: Number(totalCustomers),
        activeProducts: Number(productCounts.active) || 0,
        archivedProducts: Number(productCounts.archived) || 0,
        activeCategories: Number(categoryCounts.active) || 0,
        archivedCategories: Number(categoryCounts.archived) || 0,
        activeSuppliers: Number(supplierCounts.active) || 0,
        archivedSuppliers: Number(supplierCounts.archived) || 0,
      },
      growth: { revenueGrowthPct },
      customers: {
        newCustomers,
        returningCustomers,
        mostActiveCustomer: mostActive
          ? {
              id: mostActive.id,
              name: mostActive.full_name,
              email: mostActive.email,
              orderCount: Number(mostActive.orderCount),
              totalSpent: Number(mostActive.totalSpent),
            }
          : null,
      },
      topProducts: topProductsMapped,
      categorySales: categorySalesMapped,
      topSuppliers: topSuppliers.map((s) => ({
        id: s.id,
        name: s.name,
        unitsSold: Number(s.unitsSold),
        revenue: Number(s.revenue),
      })),
      ordersByStatus,
      highlights: {
        highestRevenueProduct: topProductsMapped.length
          ? [...topProductsMapped].sort((a, b) => b.revenue - a.revenue)[0]
          : null,
        highestRevenueCategory: categorySalesMapped.length
          ? [...categorySalesMapped].sort((a, b) => b.revenue - a.revenue)[0]
          : null,
        fastestGrowingCategory,
      },
      productsNeverSold: {
        count: Number(neverSoldCount),
        items: neverSoldRows.map((p) => ({
          id: p.id,
          name: p.name,
          createdAt: p.created_at,
        })),
      },
      topProductByWindow: {
        today: todayTop,
        week: weekTop,
        month: monthTop,
        allTime: allTimeTop,
      },
      charts: {
        granularity,
        series: series.map((row) => ({
          date:
            row.bucket instanceof Date
              ? row.bucket.toISOString().slice(0, 10)
              : String(row.bucket).slice(0, 10),
          revenue: Number(row.revenue),
          orders: Number(row.orders),
        })),
        newCustomersSeries,
      },
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        status: o.status,
        total: Number(o.total),
        created_at: o.created_at,
        itemCount: Number(o.itemCount),
      })),
      inventory: {
        totalProducts: Number(totalProducts),
        lowStock: lowStockRows
          .filter((p) => p.stock > 0)
          .map((p) => ({
            id: p.id,
            name: p.name,
            stock: p.stock,
            category: p.category_name,
            supplier: p.supplier_name,
          })),
        outOfStock: lowStockRows
          .filter((p) => p.stock === 0)
          .map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category_name,
            supplier: p.supplier_name,
          })),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboardStats };
