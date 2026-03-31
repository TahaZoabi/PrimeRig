/**
 * components/admin/AdminDashboard.tsx
 *
 * Overview dashboard shown on the Admin home tab.
 * Displays: total orders, revenue, products, low stock alerts, recent orders.
 */
import { useQuery } from "@tanstack/react-query";
import { ordersApi, productsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  ShoppingBag, DollarSign, Package, AlertTriangle, TrendingUp, Users,
} from "lucide-react";

const statusStyle: Record<string, string> = {
  pending:    "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100   text-blue-800   border-blue-200",
  shipped:    "bg-purple-100 text-purple-800 border-purple-200",
  delivered:  "bg-green-100  text-green-800  border-green-200",
  cancelled:  "bg-red-100    text-red-800    border-red-200",
};

interface Order {
  id: string; status: string; total: number; created_at: string;
  order_items: { id: string; quantity: number; price: number; products: { name: string } | null }[];
}
interface Product {
  id: string; name: string; stock: number; price: number;
  categories: { name: string } | null;
}

const AdminDashboard = () => {
  const { data: orders, isLoading: oLoading } = useQuery<Order[]>({
    queryKey: ["admin-orders"],
    queryFn: async () => { const { data } = await ordersApi.adminList(); return data; },
  });

  const { data: products, isLoading: pLoading } = useQuery<Product[]>({
    queryKey: ["admin-products"],
    queryFn: async () => { const { data } = await productsApi.adminList(); return data; },
  });

  if (oLoading || pLoading) return <LoadingSpinner />;

  // Derived stats
  const totalRevenue = orders?.reduce((s, o) => s + o.total, 0) ?? 0;
  const pendingOrders = orders?.filter((o) => o.status === "pending").length ?? 0;
  const totalProducts = products?.length ?? 0;
  const lowStock = products?.filter((p) => p.stock > 0 && p.stock <= 5) ?? [];
  const outOfStock = products?.filter((p) => p.stock === 0) ?? [];
  const recentOrders = orders?.slice(0, 6) ?? [];

  const statCards = [
    {
      label: "Total Revenue",
      value: `$${totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-900/20",
    },
    {
      label: "Total Orders",
      value: String(orders?.length ?? 0),
      icon: ShoppingBag,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Pending Orders",
      value: String(pendingOrders),
      icon: TrendingUp,
      color: "text-yellow-600",
      bg: "bg-yellow-50 dark:bg-yellow-900/20",
    },
    {
      label: "Total Products",
      value: String(totalProducts),
      icon: Package,
      color: "text-purple-600",
      bg: "bg-purple-50 dark:bg-purple-900/20",
    },
    {
      label: "Low Stock (≤5)",
      value: String(lowStock.length),
      icon: AlertTriangle,
      color: "text-orange-600",
      bg: "bg-orange-50 dark:bg-orange-900/20",
    },
    {
      label: "Out of Stock",
      value: String(outOfStock.length),
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-900/20",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className={`inline-flex items-center justify-center h-10 w-10 rounded-lg ${bg} mb-3`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold font-display">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" /> Recent Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No orders yet</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">#{order.id.slice(0, 8).toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString()}
                        {" · "}{order.order_items?.length ?? 0} item(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`${statusStyle[order.status] ?? ""} text-xs capitalize`}
                      >
                        {order.status}
                      </Badge>
                      <span className="font-semibold text-sm">${order.total.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" /> Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 && outOfStock.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">All products have healthy stock levels 🎉</p>
            ) : (
              <div className="space-y-2">
                {outOfStock.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium line-clamp-1">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.categories?.name}</p>
                    </div>
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                      Out of stock
                    </Badge>
                  </div>
                ))}
                {lowStock.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium line-clamp-1">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.categories?.name}</p>
                    </div>
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
                      {p.stock} left
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
