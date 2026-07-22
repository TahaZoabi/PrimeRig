/**
 * components/admin/AdminDashboard.tsx
 *
 * Overview dashboard shown on the Admin home tab.
 * Stats are computed on the backend for a selectable time period
 * (defaults to Last 30 Days) via GET /api/admin/stats.
 *
 * Filter state is owned by AdminPage (see PeriodFilterState) so it survives
 * switching tabs, and is passed down here as controlled props.
 */
import { useQuery } from "@tanstack/react-query";
import { adminStatsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PeriodFilter, {
  type Period,
  type PeriodOption,
} from "@/components/admin/PeriodFilter";
import RecentActivity from "@/components/admin/RecentActivity";
import type { PeriodFilterState } from "@/pages/AdminPage";
import {
  ShoppingBag,
  DollarSign,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  UserPlus,
  Clock,
  CheckCircle2,
  Crown,
  Tag,
  Receipt,
  RefreshCw,
  FolderTree,
  Truck,
  Archive,
  Flame,
  Star,
  Rocket,
  XCircle,
  PackageX,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const PERIOD_OPTIONS: PeriodOption[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "3m", label: "Last 3 Months" },
  { value: "6m", label: "Last 6 Months" },
  { value: "1y", label: "Last Year" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

const CATEGORY_COLORS = [
  "hsl(220 90% 50%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(260 80% 55%)",
  "hsl(0 84% 60%)",
  "hsl(190 80% 45%)",
  "hsl(320 70% 55%)",
  "hsl(160 60% 40%)",
];

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(45 93% 55%)",
  processing: "hsl(220 90% 55%)",
  shipped: "hsl(265 80% 60%)",
  delivered: "hsl(142 71% 45%)",
  cancelled: "hsl(0 84% 60%)",
};

const statusStyle: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100   text-blue-800   border-blue-200",
  shipped: "bg-purple-100 text-purple-800 border-purple-200",
  delivered: "bg-green-100  text-green-800  border-green-200",
  cancelled: "bg-red-100    text-red-800    border-red-200",
};

interface SeriesPoint {
  date: string;
  revenue: number;
  orders: number;
}
interface NewCustomerPoint {
  date: string;
  newCustomers: number;
}
interface TopProduct {
  id: string;
  name: string;
  unitsSold: number;
  revenue: number;
}
interface CategorySale {
  id: string;
  name: string;
  unitsSold: number;
  revenue: number;
}
interface SupplierSale {
  id: string;
  name: string;
  unitsSold: number;
  revenue: number;
}
interface RecentOrder {
  id: string;
  status: string;
  total: number;
  created_at: string;
  itemCount: number;
}
interface StockItem {
  id: string;
  name: string;
  stock?: number;
  category: string | null;
  supplier: string | null;
}
interface MostActive {
  id: string;
  name: string | null;
  email: string;
  orderCount: number;
  totalSpent: number;
}
interface WindowTop {
  name: string;
  unitsSold: number;
}

interface DashboardStats {
  period: Period;
  range: { start: string | null; end: string };
  summary: {
    revenue: number;
    orderCount: number;
    productsSold: number;
    avgOrderValue: number;
    highestOrder: number;
    lowestOrder: number;
    pendingOrders: number;
    completedOrders: number;
    revenuePerDay: number;
    ordersPerDay: number;
  };
  totals: {
    revenueAllTime: number;
    ordersAllTime: number;
    totalCustomers: number;
    activeProducts: number;
    archivedProducts: number;
    activeCategories: number;
    archivedCategories: number;
    activeSuppliers: number;
    archivedSuppliers: number;
  };
  growth: { revenueGrowthPct: number | null };
  customers: {
    newCustomers: number;
    returningCustomers: number;
    mostActiveCustomer: MostActive | null;
  };
  topProducts: TopProduct[];
  categorySales: CategorySale[];
  topSuppliers: SupplierSale[];
  ordersByStatus: Record<string, number>;
  highlights: {
    highestRevenueProduct: TopProduct | null;
    highestRevenueCategory: CategorySale | null;
    fastestGrowingCategory: {
      id: string;
      name: string;
      growthPct: number;
    } | null;
  };
  productsNeverSold: {
    count: number;
    items: { id: string; name: string; createdAt: string }[];
  };
  topProductByWindow: {
    today: WindowTop | null;
    week: WindowTop | null;
    month: WindowTop | null;
    allTime: WindowTop | null;
  };
  charts: {
    granularity: "day" | "month";
    series: SeriesPoint[];
    newCustomersSeries: NewCustomerPoint[];
  };
  recentOrders: RecentOrder[];
  inventory: {
    totalProducts: number;
    lowStock: StockItem[];
    outOfStock: StockItem[];
  };
}

const fmtCurrency = (n: number) => `$${n.toFixed(2)}`;
const fmtAxisDate = (date: string, granularity: "day" | "month") =>
  granularity === "month"
    ? new Date(date).toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      })
    : new Date(date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });

interface AdminDashboardProps {
  filter: PeriodFilterState;
  onFilterChange: (next: PeriodFilterState) => void;
}

const AdminDashboard = ({ filter, onFilterChange }: AdminDashboardProps) => {
  const { period, customStart, customEnd } = filter;
  const customReady = customStart !== "" && customEnd !== "";
  const canQuery = period !== "custom" || customReady;

  const {
    data: stats,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery<DashboardStats>({
    queryKey: [
      "admin-dashboard-stats",
      period,
      period === "custom" ? customStart : null,
      period === "custom" ? customEnd : null,
    ],
    queryFn: async () => {
      const { data } = await adminStatsApi.get({
        period,
        ...(period === "custom"
          ? { startDate: customStart, endDate: customEnd }
          : {}),
      });
      return data;
    },
    enabled: canQuery,
  });

  return (
    <div className="space-y-8">
      <PeriodFilter
        options={PERIOD_OPTIONS}
        period={period}
        onPeriodChange={(p) => onFilterChange({ ...filter, period: p })}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={(v) =>
          onFilterChange({ ...filter, customStart: v })
        }
        onCustomEndChange={(v) => onFilterChange({ ...filter, customEnd: v })}
        isFetching={isFetching && !isPending}
      />

      {period === "custom" && !customReady ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Pick a start and end date to see statistics for that range.
        </p>
      ) : isPending ? (
        <DashboardSkeleton />
      ) : isError ? (
        <ErrorState
          message={
            (error as { response?: { data?: { error?: string } } })?.response
              ?.data?.error ?? "Couldn't load dashboard statistics."
          }
          onRetry={() => refetch()}
        />
      ) : (
        <DashboardBody stats={stats} />
      )}
    </div>
  );
};

/** Shown once, on first load per filter selection — mirrors the real layout so the page doesn't jump. */
const DashboardSkeleton = () => (
  <div className="space-y-8 animate-pulse">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-24 rounded-lg bg-muted" />
      ))}
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 rounded-lg bg-muted" />
      ))}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 rounded-lg bg-muted" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-64 rounded-lg bg-muted" />
      ))}
    </div>
  </div>
);

/** Shown when the stats request fails for any reason — always gives a way back out. */
const ErrorState = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <AlertTriangle className="h-8 w-8 text-red-500" />
    <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
    <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
      <RefreshCw className="h-3.5 w-3.5" /> Try Again
    </Button>
  </div>
);

/** Small stat card used across the totals/quick-insight rows. */
const MiniStat = ({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  color: string;
  bg: string;
}) => (
  <Card className="border-0 shadow-sm">
    <CardContent className="p-3.5 flex items-center gap-3">
      <div
        className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}
      >
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold font-display leading-tight truncate">
          {value}
        </p>
        <p className="text-xs text-muted-foreground truncate">{label}</p>
      </div>
    </CardContent>
  </Card>
);

/** Renders everything once stats have loaded successfully. */
const DashboardBody = ({ stats }: { stats: DashboardStats }) => {
  const {
    summary,
    totals,
    growth,
    customers,
    topProducts,
    categorySales,
    topSuppliers,
    ordersByStatus,
    highlights,
    productsNeverSold,
    topProductByWindow,
    charts,
    recentOrders,
    inventory,
  } = stats;

  const mainStats = [
    {
      label: "Revenue",
      value: fmtCurrency(summary.revenue),
      sub: `${fmtCurrency(summary.revenuePerDay)}/day avg`,
      icon: DollarSign,
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-900/20",
    },
    {
      label: "Orders",
      value: String(summary.orderCount),
      sub: `${summary.ordersPerDay.toFixed(1)}/day avg`,
      icon: ShoppingBag,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Products Sold",
      value: String(summary.productsSold),
      sub: undefined,
      icon: Package,
      color: "text-purple-600",
      bg: "bg-purple-50 dark:bg-purple-900/20",
    },
    {
      label: "Avg Order Value",
      value: fmtCurrency(summary.avgOrderValue),
      sub: undefined,
      icon: Receipt,
      color: "text-indigo-600",
      bg: "bg-indigo-50 dark:bg-indigo-900/20",
    },
    {
      label: "Pending Orders",
      value: String(summary.pendingOrders),
      sub: undefined,
      icon: Clock,
      color: "text-yellow-600",
      bg: "bg-yellow-50 dark:bg-yellow-900/20",
    },
    {
      label: "Completed Orders",
      value: String(summary.completedOrders),
      sub: undefined,
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      label: "New Customers",
      value: String(customers.newCustomers),
      sub: undefined,
      icon: UserPlus,
      color: "text-cyan-600",
      bg: "bg-cyan-50 dark:bg-cyan-900/20",
    },
    {
      label: "Returning Customers",
      value: String(customers.returningCustomers),
      sub: undefined,
      icon: Users,
      color: "text-teal-600",
      bg: "bg-teal-50 dark:bg-teal-900/20",
    },
  ];

  const ordersByStatusData = Object.entries(ordersByStatus)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ status, count }));

  return (
    <div className="space-y-8">
      {/* Main stat cards (period-scoped) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {mainStats.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div
                  className={`inline-flex items-center justify-center h-10 w-10 rounded-lg ${bg} mb-3`}
                >
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                {label === "Revenue" && growth.revenueGrowthPct !== null && (
                  <span
                    className={`flex items-center gap-0.5 text-xs font-medium ${
                      growth.revenueGrowthPct >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {growth.revenueGrowthPct >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {Math.abs(growth.revenueGrowthPct).toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold font-display">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              {sub && (
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  {sub}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* All-time business totals — always the same regardless of the selected period */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          All-Time Totals
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat
            icon={DollarSign}
            label="Total Revenue"
            value={fmtCurrency(totals.revenueAllTime)}
            color="text-green-600"
            bg="bg-green-50 dark:bg-green-900/20"
          />
          <MiniStat
            icon={ShoppingBag}
            label="Total Orders"
            value={String(totals.ordersAllTime)}
            color="text-blue-600"
            bg="bg-blue-50 dark:bg-blue-900/20"
          />
          <MiniStat
            icon={Users}
            label="Total Customers"
            value={String(totals.totalCustomers)}
            color="text-teal-600"
            bg="bg-teal-50 dark:bg-teal-900/20"
          />
          <MiniStat
            icon={Package}
            label="Active Products"
            value={String(totals.activeProducts)}
            color="text-purple-600"
            bg="bg-purple-50 dark:bg-purple-900/20"
          />
          <MiniStat
            icon={Archive}
            label="Archived Products"
            value={String(totals.archivedProducts)}
            color="text-slate-500"
            bg="bg-slate-100 dark:bg-slate-800/40"
          />
          <MiniStat
            icon={FolderTree}
            label="Categories"
            value={`${totals.activeCategories} active${totals.archivedCategories ? ` · ${totals.archivedCategories} archived` : ""}`}
            color="text-orange-600"
            bg="bg-orange-50 dark:bg-orange-900/20"
          />
          <MiniStat
            icon={Truck}
            label="Suppliers"
            value={`${totals.activeSuppliers} active${totals.archivedSuppliers ? ` · ${totals.archivedSuppliers} archived` : ""}`}
            color="text-cyan-600"
            bg="bg-cyan-50 dark:bg-cyan-900/20"
          />
        </div>
      </div>

      {/* Quick insights */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Quick Insights
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MiniStat
            icon={Flame}
            label="Best Seller"
            value={topProducts[0]?.name ?? "—"}
            color="text-orange-600"
            bg="bg-orange-50 dark:bg-orange-900/20"
          />
          <MiniStat
            icon={Star}
            label="Top Revenue Product"
            value={highlights.highestRevenueProduct?.name ?? "—"}
            color="text-yellow-600"
            bg="bg-yellow-50 dark:bg-yellow-900/20"
          />
          <MiniStat
            icon={Rocket}
            label="Fastest Growing Category"
            value={
              highlights.fastestGrowingCategory
                ? `${highlights.fastestGrowingCategory.name} (+${highlights.fastestGrowingCategory.growthPct.toFixed(0)}%)`
                : "N/A"
            }
            color="text-pink-600"
            bg="bg-pink-50 dark:bg-pink-900/20"
          />
          <MiniStat
            icon={AlertTriangle}
            label="Low Stock Alerts"
            value={String(inventory.lowStock.length)}
            color="text-amber-600"
            bg="bg-amber-50 dark:bg-amber-900/20"
          />
          <MiniStat
            icon={Clock}
            label="Pending Orders"
            value={String(ordersByStatus.pending ?? 0)}
            color="text-blue-600"
            bg="bg-blue-50 dark:bg-blue-900/20"
          />
          <MiniStat
            icon={XCircle}
            label="Cancelled Orders"
            value={String(ordersByStatus.cancelled ?? 0)}
            color="text-red-600"
            bg="bg-red-50 dark:bg-red-900/20"
          />
        </div>
      </div>

      {/* Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
              <Crown className="h-3.5 w-3.5" /> Top Selling Product
            </div>
            {topProducts.length ? (
              <>
                <p className="font-semibold line-clamp-1">
                  {topProducts[0].name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {topProducts[0].unitsSold} units sold
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No sales in this period
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
              <Tag className="h-3.5 w-3.5" /> Best Selling Category
            </div>
            {categorySales.length ? (
              <>
                <p className="font-semibold line-clamp-1">
                  {categorySales[0].name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {categorySales[0].unitsSold} units sold
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No sales in this period
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
              <Users className="h-3.5 w-3.5" /> Most Active Customer
            </div>
            {customers.mostActiveCustomer ? (
              <>
                <p className="font-semibold line-clamp-1">
                  {customers.mostActiveCustomer.name ||
                    customers.mostActiveCustomer.email}
                </p>
                <p className="text-sm text-muted-foreground">
                  {customers.mostActiveCustomer.orderCount} orders ·{" "}
                  {fmtCurrency(customers.mostActiveCustomer.totalSpent)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No orders in this period
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Highest / Lowest order + Top product by window */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between gap-4 h-full">
            <div>
              <p className="text-xs text-muted-foreground">Highest Order</p>
              <p className="text-lg font-bold font-display">
                {fmtCurrency(summary.highestOrder)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground text-right">
                Lowest Order
              </p>
              <p className="text-lg font-bold font-display text-right">
                {fmtCurrency(summary.lowestOrder)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
              Top Seller — Today / Week / Month / All-Time
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  ["Today", topProductByWindow.today],
                  ["This Week", topProductByWindow.week],
                  ["This Month", topProductByWindow.month],
                  ["All Time", topProductByWindow.allTime],
                ] as const
              ).map(([label, w]) => (
                <div key={label}>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium line-clamp-1">
                    {w?.name ?? "No sales"}
                  </p>
                  {w && (
                    <p className="text-xs text-muted-foreground">
                      {w.unitsSold} units
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Revenue Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {charts.series.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={charts.series}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    opacity={0.3}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => fmtAxisDate(d, charts.granularity)}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={50} />
                  <Tooltip
                    formatter={(value) => [
                      fmtCurrency(Number(value)),
                      "Revenue",
                    ]}
                    labelFormatter={(d) =>
                      fmtAxisDate(String(d), charts.granularity)
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(220 90% 50%)"
                    fill="hsl(220 90% 50%)"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-16 text-center">
                No revenue data for this period
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" /> Orders Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {charts.series.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={charts.series}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    opacity={0.3}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => fmtAxisDate(d, charts.granularity)}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    width={40}
                    allowDecimals={false}
                  />
                  <Tooltip
                    labelFormatter={(d) =>
                      fmtAxisDate(String(d), charts.granularity)
                    }
                  />
                  <Bar
                    dataKey="orders"
                    fill="hsl(38 92% 50%)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-16 text-center">
                No order data for this period
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> New Customers Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {charts.newCustomersSeries.some((p) => p.newCustomers > 0) ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={charts.newCustomersSeries}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    opacity={0.3}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => fmtAxisDate(d, charts.granularity)}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    width={30}
                    allowDecimals={false}
                  />
                  <Tooltip
                    labelFormatter={(d) =>
                      fmtAxisDate(String(d), charts.granularity)
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="newCustomers"
                    stroke="hsl(190 80% 45%)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-16 text-center">
                No new customers in this period
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" /> Orders by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ordersByStatusData.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={ordersByStatusData}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {ordersByStatusData.map((d) => (
                      <Cell
                        key={d.status}
                        fill={STATUS_COLORS[d.status] ?? "hsl(220 10% 60%)"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value} orders`, name]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(v) => <span className="capitalize">{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-16 text-center">
                No orders for this period
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="h-4 w-4" /> Top 5 Selling Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={topProducts}
                  layout="vertical"
                  margin={{ left: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    opacity={0.3}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(n) =>
                      String(n).length > 16
                        ? `${String(n).slice(0, 16)}…`
                        : String(n)
                    }
                  />
                  <Tooltip formatter={(value) => [`${value} units`, "Sold"]} />
                  <Bar
                    dataKey="unitsSold"
                    fill="hsl(260 80% 55%)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-16 text-center">
                No sales data for this period
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4" /> Sales by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categorySales.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={categorySales}
                    dataKey="unitsSold"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {categorySales.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} units`, "Sold"]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-16 text-center">
                No sales data for this period
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Suppliers + Products Never Sold */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4" /> Top Suppliers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topSuppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No supplier sales in this period
              </p>
            ) : (
              <div className="space-y-2">
                {topSuppliers.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-1.5 border-b last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground w-4">
                        {i + 1}
                      </span>
                      <p className="text-sm font-medium truncate">{s.name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold">
                        {fmtCurrency(s.revenue)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.unitsSold} units
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PackageX className="h-4 w-4 text-slate-500" /> Products Never
              Sold
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {productsNeverSold.count} total
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {productsNeverSold.items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Every active product has sold at least once 🎉
              </p>
            ) : (
              <div className="space-y-2">
                {productsNeverSold.items.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-1.5 border-b last:border-0"
                  >
                    <p className="text-sm font-medium line-clamp-1">{p.name}</p>
                    <p className="text-xs text-muted-foreground flex-shrink-0">
                      Added {new Date(p.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent orders + stock alerts + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" /> Recent Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No orders in this period
              </p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString()}
                        {" · "}
                        {order.itemCount} item(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`${statusStyle[order.status] ?? ""} text-xs capitalize`}
                      >
                        {order.status}
                      </Badge>
                      <span className="font-semibold text-sm">
                        {fmtCurrency(order.total)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" /> Stock Alerts
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {inventory.totalProducts} products in catalog
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {inventory.lowStock.length === 0 &&
            inventory.outOfStock.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                All products have healthy stock levels 🎉
              </p>
            ) : (
              <div className="space-y-2">
                {inventory.outOfStock.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-1.5 border-b last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium line-clamp-1">
                        {p.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.category} · {p.supplier ?? "No supplier"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-red-50 text-red-700 border-red-200 text-xs"
                    >
                      Out of stock
                    </Badge>
                  </div>
                ))}
                {inventory.lowStock.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-1.5 border-b last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium line-clamp-1">
                        {p.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.category} · {p.supplier ?? "No supplier"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-red-100 text-red-800 border-red-300 text-xs font-semibold"
                    >
                      {p.stock} left
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <RecentActivity />
      </div>
    </div>
  );
};

export default AdminDashboard;
