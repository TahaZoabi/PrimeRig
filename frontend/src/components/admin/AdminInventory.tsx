/**
 * components/admin/AdminInventory.tsx
 *
 * Inventory tab: Low Stock, Out of Stock, Purchase Orders, and Restock
 * History. Purchase Orders here are internal replenishment records only —
 * created automatically by the auto-reorder check on the backend, or
 * moved through their lifecycle manually here. Nothing here ever places a
 * real order with a supplier.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productsApi, purchaseOrdersApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LoadingSpinner from "@/components/LoadingSpinner";
import { toast } from "sonner";

interface AdminProduct {
  id: string;
  name: string;
  stock: number;
  is_active: boolean;
  categories: { name: string } | null;
  suppliers: { name: string } | null;
}

interface PurchaseOrder {
  id: string;
  product_name: string;
  supplier_name: string;
  quantity: number;
  status: string;
  created_at: string;
  updated_at: string;
}

const PO_TRANSITIONS: Record<string, string[]> = {
  pending: ["ordered", "cancelled"],
  ordered: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

const poStatusStyle: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  ordered: "bg-blue-100 text-blue-800 border-blue-200",
  received: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

const AdminInventory = () => {
  const queryClient = useQueryClient();

  const { data: products, isLoading: productsLoading } = useQuery<
    AdminProduct[]
  >({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data } = await productsApi.adminList();
      return data;
    },
  });

  const { data: purchaseOrders, isLoading: poLoading } = useQuery<
    PurchaseOrder[]
  >({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data } = await purchaseOrdersApi.list();
      return data;
    },
  });

  const updatePoStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await purchaseOrdersApi.updateStatus(id, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Purchase order updated");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(
        err?.response?.data?.error ?? "Failed to update purchase order",
      );
    },
  });

  if (productsLoading || poLoading) return <LoadingSpinner />;

  const activeProducts = products?.filter((p) => p.is_active) ?? [];
  const outOfStock = activeProducts.filter((p) => p.stock === 0);
  const lowStock = activeProducts.filter((p) => p.stock > 0 && p.stock <= 5);
  const activePOs =
    purchaseOrders?.filter((po) => po.status !== "received") ?? [];
  const restockHistory =
    purchaseOrders?.filter((po) => po.status === "received") ?? [];

  return (
    <div>
      <Tabs defaultValue="low-stock">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="low-stock">
            Low Stock ({lowStock.length})
          </TabsTrigger>
          <TabsTrigger value="out-of-stock">
            Out of Stock ({outOfStock.length})
          </TabsTrigger>
          <TabsTrigger value="purchase-orders">
            Purchase Orders ({activePOs.length})
          </TabsTrigger>
          <TabsTrigger value="restock-history">
            Restock History ({restockHistory.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="low-stock">
          {lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No products are running low
            </p>
          ) : (
            <div className="space-y-2">
              {lowStock.map((p) => (
                <Card key={p.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.categories?.name ?? "No category"} ·{" "}
                        {p.suppliers?.name ?? "No supplier"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-amber-100 text-amber-800 border-amber-300 font-semibold"
                    >
                      {p.stock} left
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="out-of-stock">
          {outOfStock.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nothing is out of stock 🎉
            </p>
          ) : (
            <div className="space-y-2">
              {outOfStock.map((p) => (
                <Card key={p.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.categories?.name ?? "No category"} ·{" "}
                        {p.suppliers?.name ?? "No supplier"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-red-50 text-red-700 border-red-200"
                    >
                      Out of stock
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="purchase-orders">
          {activePOs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No open purchase orders
            </p>
          ) : (
            <div className="space-y-2">
              {activePOs.map((po) => (
                <Card key={po.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold">{po.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Qty {po.quantity} · from {po.supplier_name} · created{" "}
                        {new Date(po.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`${poStatusStyle[po.status] ?? ""} capitalize`}
                      >
                        {po.status}
                      </Badge>
                      <Select
                        value={po.status}
                        onValueChange={(status) =>
                          updatePoStatus.mutate({ id: po.id, status })
                        }
                      >
                        <SelectTrigger className="w-32 h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            po.status,
                            ...(PO_TRANSITIONS[po.status] ?? []),
                          ].map((s) => (
                            <SelectItem
                              key={s}
                              value={s}
                              className="capitalize"
                            >
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="restock-history">
          {restockHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nothing has been restocked yet
            </p>
          ) : (
            <div className="space-y-2">
              {restockHistory.map((po) => (
                <Card key={po.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold">{po.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        +{po.quantity} units from {po.supplier_name}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Received {new Date(po.updated_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminInventory;
