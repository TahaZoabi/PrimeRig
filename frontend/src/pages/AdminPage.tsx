/**
 * pages/AdminPage.tsx - Admin dashboard
 * Protected: redirects non-admins to home.
 * Tabs: Dashboard | Products | Categories | Suppliers | Orders
 */
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminProducts from "@/components/admin/AdminProducts";
import AdminCategories from "@/components/admin/AdminCategories";
import AdminSuppliers from "@/components/admin/AdminSuppliers";
import AdminOrders from "@/components/admin/AdminOrders";
import AdminInventory from "@/components/admin/AdminInventory";
import type { Period } from "@/components/admin/PeriodFilter";
import {
  LayoutDashboard,
  Package,
  FolderTree,
  Truck,
  ShoppingBag,
  Boxes,
} from "lucide-react";

export interface PeriodFilterState {
  period: Period;
  customStart: string;
  customEnd: string;
}

const AdminPage = () => {
  const { isAdmin, loading } = useAuth();

  const [activeTab, setActiveTab] = useState("dashboard");

  // Set by the Overview dashboard's "View Product" action: switches to the
  // Products tab and tells it which product to open the edit dialog for.
  // Cleared once AdminProducts has consumed it, so revisiting the tab later
  // doesn't reopen the same dialog.
  const [pendingEditProductId, setPendingEditProductId] = useState<string | null>(null);

  const goToProduct = (productId: string) => {
    setPendingEditProductId(productId);
    setActiveTab("products");
  };

  // Lifted up here (rather than kept as local state inside each tab) so the
  // selected filter survives switching tabs. Radix's Tabs.Content unmounts
  // inactive tabs by default, which would otherwise reset each tab's filter
  // back to its default every time you navigated away and back.
  const [dashboardFilter, setDashboardFilter] = useState<PeriodFilterState>({
    period: "30d",
    customStart: "",
    customEnd: "",
  });
  const [ordersFilter, setOrdersFilter] = useState<PeriodFilterState>({
    period: "30d",
    customStart: "",
    customEnd: "",
  });

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Manage your store — products, orders, and more.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" /> Products
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <FolderTree className="h-4 w-4" /> Categories
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="flex items-center gap-2">
            <Truck className="h-4 w-4" /> Suppliers
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" /> Orders
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center gap-2">
            <Boxes className="h-4 w-4" /> Inventory
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <AdminDashboard
            filter={dashboardFilter}
            onFilterChange={setDashboardFilter}
            onViewProduct={goToProduct}
            onViewOrders={() => setActiveTab("orders")}
            onViewInventory={() => setActiveTab("inventory")}
          />
        </TabsContent>
        <TabsContent value="products">
          <AdminProducts
            initialEditProductId={pendingEditProductId}
            onInitialEditHandled={() => setPendingEditProductId(null)}
          />
        </TabsContent>
        <TabsContent value="categories">
          <AdminCategories />
        </TabsContent>
        <TabsContent value="suppliers">
          <AdminSuppliers />
        </TabsContent>
        <TabsContent value="orders">
          <AdminOrders filter={ordersFilter} onFilterChange={setOrdersFilter} />
        </TabsContent>
        <TabsContent value="inventory">
          <AdminInventory />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPage;
