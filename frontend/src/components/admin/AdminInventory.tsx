/**
 * components/admin/AdminInventory.tsx
 *
 * Inventory tab: Low Stock, Out of Stock, Active Purchase Orders, and
 * Restock History. Purchase Orders (active, in-flight supplier orders) and
 * Restock History (completed inventory additions, manual or automatic) are
 * deliberately different data sources — see backend/src/controllers/
 * inventoryController.js and purchaseOrdersController.js.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, purchaseOrdersApi, suppliersApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LoadingSpinner from "@/components/LoadingSpinner";
import OrderFromSupplierDialog from "@/components/admin/OrderFromSupplierDialog";
import { Truck } from "lucide-react";
import { toast } from "sonner";

interface InventoryOverviewItem {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
  target_stock_level: number;
  auto_reorder: boolean;
  supplier_id: string | null;
  preferred_supplier_id: string | null;
  category_name: string | null;
  supplier_name: string | null;
  preferred_supplier_name: string | null;
  next_restock_quantity: number | null;
  last_restock_date: string | null;
  last_po_status: string | null;
}

interface PurchaseOrder {
  id: string;
  product_id: string;
  supplier_id: string;
  product_name: string;
  supplier_name: string;
  quantity: number;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface RestockHistoryItem {
  id: string;
  product_name: string;
  supplier_name: string | null;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  source: string;
  purchase_order_id: string | null;
  created_at: string;
}

// Mirrors the backend's ALLOWED_TRANSITIONS in purchaseOrdersController.js —
// the backend is the source of truth and re-validates regardless.
const PO_TRANSITIONS: Record<string, string[]> = {
  pending: ["approved", "cancelled"],
  approved: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["received"],
  received: [],
  cancelled: [],
};

const poStatusStyle: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-cyan-100 text-cyan-800 border-cyan-200",
  shipped: "bg-blue-100 text-blue-800 border-blue-200",
  delivered: "bg-purple-100 text-purple-800 border-purple-200",
  received: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

const AutoRestockBadge = ({ on }: { on: boolean }) => (
  <Badge
    variant="outline"
    className={
      on
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-slate-100 text-slate-600 border-slate-300"
    }
  >
    Auto Restock: {on ? "ON" : "OFF"}
  </Badge>
);

const AdminInventory = () => {
  const queryClient = useQueryClient();
  const [orderFromSupplierProduct, setOrderFromSupplierProduct] =
    useState<InventoryOverviewItem | null>(null);

  const { data: overview, isLoading: overviewLoading } = useQuery<
    InventoryOverviewItem[]
  >({
    queryKey: ["inventory-overview"],
    queryFn: async () => {
      const { data } = await inventoryApi.overview();
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

  const { data: restockHistory, isLoading: historyLoading } = useQuery<
    RestockHistoryItem[]
  >({
    queryKey: ["restock-history"],
    queryFn: async () => {
      const { data } = await inventoryApi.restockHistory();
      return data;
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["admin-suppliers"],
    queryFn: async () => {
      const { data } = await suppliersApi.adminList();
      return data;
    },
  });

  const updatePoStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await purchaseOrdersApi.updateStatus(id, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-overview"] });
      queryClient.invalidateQueries({ queryKey: ["restock-history"] });
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

  if (overviewLoading || poLoading || historyLoading) return <LoadingSpinner />;

  const activeItems = overview ?? [];
  const outOfStock = activeItems.filter((p) => p.stock === 0);
  const lowStock = activeItems.filter(
    (p) => p.stock > 0 && p.stock <= p.min_stock && p.min_stock > 0,
  );
  const activePOs =
    purchaseOrders?.filter(
      (po) => po.status !== "received" && po.status !== "cancelled",
    ) ?? [];

  const renderProductRow = (
    p: InventoryOverviewItem,
    tone: "amber" | "red",
  ) => (
    <Card key={p.id}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="font-semibold">{p.name}</p>
            <p className="text-sm text-muted-foreground">
              {p.category_name ?? "No category"} ·{" "}
              {p.supplier_name ?? "No supplier"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                tone === "red"
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-amber-100 text-amber-800 border-amber-300 font-semibold"
              }
            >
              {tone === "red" ? "Out of stock" : `${p.stock} left`}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              title="Order From Supplier"
              onClick={() => setOrderFromSupplierProduct(p)}
            >
              <Truck className="h-4 w-4 text-blue-600" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <AutoRestockBadge on={p.auto_reorder} />
          {p.auto_reorder && p.next_restock_quantity !== null && (
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-700 border-blue-200"
            >
              Next restock qty: {p.next_restock_quantity}
            </Badge>
          )}
          {p.last_po_status && (
            <Badge
              variant="outline"
              className={`${poStatusStyle[p.last_po_status] ?? ""} capitalize`}
            >
              Last PO: {p.last_po_status}
            </Badge>
          )}
        </div>

        <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
          <span>Preferred supplier: {p.preferred_supplier_name ?? "—"}</span>
          <span>
            Last restock:{" "}
            {p.last_restock_date
              ? new Date(p.last_restock_date).toLocaleDateString()
              : "Never"}
          </span>
        </div>
      </CardContent>
    </Card>
  );

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
            Restock History ({restockHistory?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="low-stock">
          {lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No products are running low
            </p>
          ) : (
            <div className="space-y-2">
              {lowStock.map((p) => renderProductRow(p, "amber"))}
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
              {outOfStock.map((p) => renderProductRow(p, "red"))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="purchase-orders">
          {activePOs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No active purchase orders
            </p>
          ) : (
            <div className="space-y-2">
              {activePOs.map((po) => (
                <Card key={po.id}>
                  <CardContent className="flex items-center justify-between p-4 flex-wrap gap-2">
                    <div>
                      <p className="font-semibold">{po.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Qty {po.quantity} · from {po.supplier_name} · created{" "}
                        {new Date(po.created_at).toLocaleDateString()}
                        {" · "}
                        <span className="capitalize">{po.created_by}</span>
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
                        <SelectTrigger className="w-36 h-8 text-sm">
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
          {!restockHistory || restockHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nothing has been restocked yet
            </p>
          ) : (
            <div className="space-y-2">
              {restockHistory.map((r) => (
                <Card key={r.id}>
                  <CardContent className="flex items-center justify-between p-4 flex-wrap gap-2">
                    <div>
                      <p className="font-semibold">{r.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.previous_stock} → {r.new_stock} (+{r.quantity})
                        {r.supplier_name && ` · from ${r.supplier_name}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <Badge
                        variant="outline"
                        className={
                          r.source === "manual"
                            ? "bg-slate-100 text-slate-700 border-slate-300"
                            : "bg-green-100 text-green-800 border-green-200"
                        }
                      >
                        {r.source === "manual" ? "Manual" : "Purchase Order"}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <OrderFromSupplierDialog
        product={orderFromSupplierProduct}
        suppliers={suppliers}
        onOpenChange={(o) => {
          if (!o) setOrderFromSupplierProduct(null);
        }}
      />
    </div>
  );
};

export default AdminInventory;
