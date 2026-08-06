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
     WHERE ${rangeSql} AND o.status != 'cancelled'
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

    // ---- Summary: revenue, order count, highest/lowest, completed ----
    // Cancelled orders are excluded from revenue/orderCount/highest/lowest —
    // a cancelled order never completed as a sale, so it must not inflate
    // any dollar or unit metric. completedOrders is counted by its own
    // status condition regardless, so it's unaffected.
    //
    // No "pendingOrders" here: since orders are only ever created via the
    // verified PayPal capture flow (see orderFulfillment.js), every order is
    // inserted directly as "processing" — status "pending" is not reachable
    // by current business logic, so a live pending-order count would always
    // read ~0 and no longer means anything. See ordersByStatus.processing /
    // ordersByStatus.shipped below for the metrics that replaced it.
    const [[summaryRow]] = await pool.query(
      `SELECT
         COALESCE(SUM(total), 0)                                AS revenue,
         COUNT(*)                                                AS orderCount,
         COALESCE(MAX(total), 0)                                AS highestOrder,
         COALESCE(MIN(total), 0)                                AS lowestOrder,
         SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)   AS completedOrders
       FROM orders
       WHERE ${rangeSql("created_at")} AND status != 'cancelled'`,
      rangeParams,
    );

    // ---- Products sold in range ----
    const [[soldRow]] = await pool.query(
      `SELECT COALESCE(SUM(oi.quantity), 0) AS productsSold
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE ${rangeSql("o.created_at")} AND o.status != 'cancelled'`,
      rangeParams,
    );

    // ---- Previous-period revenue, for the growth % ----
    let revenueGrowthPct = null;
    if (prevStart) {
      const [[prevRow]] = await pool.query(
        `SELECT COALESCE(SUM(total), 0) AS revenue FROM orders WHERE created_at >= ? AND created_at < ? AND status != 'cancelled'`,
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
       WHERE ${rangeSql("o.created_at")} AND o.status != 'cancelled'
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
       WHERE ${rangeSql("o.created_at")} AND o.status != 'cancelled'
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
       WHERE ${rangeSql("o.created_at")} AND o.status != 'cancelled'
       GROUP BY s.id, s.name
       ORDER BY unitsSold DESC
       LIMIT 5`,
      rangeParams,
    );

    // ---- Orders by status, in range ----
    // Intentionally UNFILTERED by status — this is the one place cancelled
    // orders are meant to be counted, since the whole point is to show how
    // many fall into each status including cancelled.
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
       WHERE ${rangeSql("o.created_at")} AND o.status != 'cancelled'
       GROUP BY u.id, u.full_name, u.email
       ORDER BY orderCount DESC, totalSpent DESC
       LIMIT 1`,
      rangeParams,
    );

    // ---- New vs. returning customers (+ bucketed new-customers-over-time) ----
    // Definition: among customers with at least one NON-CANCELLED order in
    // the selected period, a customer is "new" if that's their only
    // non-cancelled order ever (as of now); "returning" if they have 2+
    // non-cancelled orders ever, full stop — independent of the period's
    // start date.
    let newCustomers = 0;
    let returningCustomers = 0;
    const newCustomerDates = [];
    {
      const [customerActivity] = await pool.query(
        `SELECT o.user_id, COUNT(*) AS lifetimeOrders, MIN(o.created_at) AS firstOrderAt
         FROM orders o
         WHERE o.status != 'cancelled'
           AND o.user_id IN (
             SELECT DISTINCT user_id FROM orders
             WHERE status != 'cancelled' AND ${rangeSql("created_at")}
           )
         GROUP BY o.user_id`,
        rangeParams,
      );
      customerActivity.forEach((row) => {
        const lifetimeOrders = Number(row.lifetimeOrders);
        if (lifetimeOrders <= 1) {
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
       WHERE ${rangeSql("created_at")} AND status != 'cancelled'
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
    // "Low stock" is each product's own configured threshold (min_stock),
    // never a fixed number — this must match the Inventory tab's definition
    // exactly (see AdminInventory.tsx and getInventoryOverview), or a
    // product can show as low-stock in one place and not the other.
    const [[{ totalProducts }]] = await pool.query(
      `SELECT COUNT(*) AS totalProducts FROM products WHERE is_active = 1`,
    );
    const [lowStockRows] = await pool.query(
      `SELECT p.id, p.name, p.stock, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       WHERE p.is_active = 1 AND p.stock <= p.min_stock
       ORDER BY p.stock ASC
       LIMIT 15`,
    );

    // ---- Inventory Alerts widget (current state — not period-scoped) ----
    const [[{ outOfStockCount }]] = await pool.query(
      `SELECT COUNT(*) AS outOfStockCount FROM products WHERE is_active = 1 AND stock = 0`,
    );
    const [[{ lowStockCount }]] = await pool.query(
      `SELECT COUNT(*) AS lowStockCount FROM products WHERE is_active = 1 AND stock > 0 AND stock <= min_stock`,
    );
    const [[{ autoReordersTriggered }]] = await pool.query(
      `SELECT COUNT(*) AS autoReordersTriggered FROM purchase_orders`,
    );
    const [[{ pendingPurchaseOrders }]] = await pool.query(
      `SELECT COUNT(*) AS pendingPurchaseOrders FROM purchase_orders WHERE status = 'pending'`,
    );

    // ---- All-time totals (never period-scoped — these describe the whole business) ----
    const [[allTimeOrders]] = await pool.query(
      `SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orderCount FROM orders WHERE status != 'cancelled'`,
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
    // "Sold" means a non-cancelled order referenced it — a product that only
    // ever appeared in a cancelled order was never actually sold.
    const [[{ neverSoldCount }]] = await pool.query(
      `SELECT COUNT(*) AS neverSoldCount
       FROM products p
       WHERE p.is_active = 1
         AND NOT EXISTS (
           SELECT 1 FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE oi.product_id = p.id AND o.status != 'cancelled'
         )`,
    );
    const [neverSoldRows] = await pool.query(
      `SELECT p.id, p.name, p.created_at
       FROM products p
       WHERE p.is_active = 1
         AND NOT EXISTS (
           SELECT 1 FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE oi.product_id = p.id AND o.status != 'cancelled'
         )
       ORDER BY p.created_at ASC
       LIMIT 5`,
    );

    // ---- Fastest-growing category ----
    // Compares each category's revenue in the first half of the CURRENTLY
    // SELECTED range against its second half, using the same effective
    // start as the charts (seriesStart: the real earliest order date for
    // "All Time", otherwise the period's own start).
    //
    // The previous version compared the selected period against an
    // external period immediately BEFORE it. That's structurally unusable
    // for "All Time" (there is no period before "all time", so this was
    // unconditionally skipped) and, for any bounded period, only produces
    // a value when that earlier window already had revenue for a category
    // — which is normally NOT the case for a store whose orders are all
    // recent, i.e. the exact situation for anyone actively testing this
    // app. An internal first-half-vs-second-half split needs no data
    // outside the range being viewed, so it can produce a real answer as
    // soon as a category has any sales spread across the window — while
    // still failing honestly (null, not a fabricated number) if there
    // genuinely isn't enough of a spread yet.
    let fastestGrowingCategory = null;
    {
      const rangeStart = seriesStart;
      const midpoint = new Date(
        rangeStart.getTime() + (end.getTime() - rangeStart.getTime()) / 2,
      );

      if (midpoint.getTime() > rangeStart.getTime()) {
        const [halves] = await pool.query(
          `SELECT c.id, c.name,
                  SUM(CASE WHEN o.created_at < ? THEN oi.quantity * oi.price ELSE 0 END) AS firstHalfRevenue,
                  SUM(CASE WHEN o.created_at >= ? THEN oi.quantity * oi.price ELSE 0 END) AS secondHalfRevenue
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN products p ON p.id = oi.product_id
           JOIN categories c ON c.id = p.category_id
           WHERE o.created_at >= ? AND o.created_at <= ? AND o.status != 'cancelled'
           GROUP BY c.id, c.name`,
          [midpoint, midpoint, rangeStart, end],
        );
        let best = null;
        halves.forEach((row) => {
          const firstHalf = Number(row.firstHalfRevenue);
          const secondHalf = Number(row.secondHalfRevenue);
          if (firstHalf > 0) {
            const growthPct = ((secondHalf - firstHalf) / firstHalf) * 100;
            if (!best || growthPct > best.growthPct) {
              best = { id: row.id, name: row.name, growthPct };
            }
          }
        });
        fastestGrowingCategory = best;
      }
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
      inventoryAlerts: {
        outOfStock: Number(outOfStockCount),
        lowStock: Number(lowStockCount),
        autoReordersTriggered: Number(autoReordersTriggered),
        pendingPurchaseOrders: Number(pendingPurchaseOrders),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboardStats };
