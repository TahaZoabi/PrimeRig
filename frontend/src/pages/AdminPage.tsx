/**
 * pages/AdminPage.tsx - Admin dashboard
 * Protected: redirects non-admins to home.
 * Tabs: Dashboard | Products | Categories | Suppliers | Orders
 */
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminDashboard  from "@/components/admin/AdminDashboard";
import AdminProducts   from "@/components/admin/AdminProducts";
import AdminCategories from "@/components/admin/AdminCategories";
import AdminSuppliers  from "@/components/admin/AdminSuppliers";
import AdminOrders     from "@/components/admin/AdminOrders";
import { LayoutDashboard, Package, FolderTree, Truck, ShoppingBag } from "lucide-react";

const AdminPage = () => {
  const { isAdmin, loading } = useAuth();

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Manage your store — products, orders, and more.</p>
      </div>

      <Tabs defaultValue="dashboard">
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
        </TabsList>

        <TabsContent value="dashboard"><AdminDashboard /></TabsContent>
        <TabsContent value="products"><AdminProducts /></TabsContent>
        <TabsContent value="categories"><AdminCategories /></TabsContent>
        <TabsContent value="suppliers"><AdminSuppliers /></TabsContent>
        <TabsContent value="orders"><AdminOrders /></TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPage;
