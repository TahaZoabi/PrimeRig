/**
 * components/admin/AdminOrders.tsx
 * View all orders and update their status via dropdown.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ordersApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import LoadingSpinner from "@/components/LoadingSpinner";
import { toast } from "sonner";

const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;

const statusStyle: Record<string, string> = {
  pending:    "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100   text-blue-800   border-blue-200",
  shipped:    "bg-purple-100 text-purple-800 border-purple-200",
  delivered:  "bg-green-100  text-green-800  border-green-200",
  cancelled:  "bg-red-100    text-red-800    border-red-200",
};

interface AdminOrder {
  id: string;
  user_id: string;
  status: string;
  total: number;
  shipping_address: string | null;
  payment_method: string | null;
  created_at: string;
  order_items: Array<{
    id: string;
    quantity: number;
    price: number;
    products: { name: string } | null;
  }>;
}

const AdminOrders = () => {
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery<AdminOrder[]>({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data } = await ordersApi.adminList();
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await ordersApi.updateStatus(id, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("Order status updated");
    },
    onError: () => {
      toast.error("Failed to update order status");
    },
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        {orders?.length ?? 0} total orders
      </p>

      <div className="space-y-4">
        {orders?.map((order) => (
          <Card key={order.id}>
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-base">
                  Order #{order.id.slice(0, 8).toUpperCase()}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {new Date(order.created_at).toLocaleString("en-US", {
                    year: "numeric", month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {/* Status updater */}
                <Select
                  value={order.status}
                  onValueChange={(status) => updateStatus.mutate({ id: order.id, status })}
                >
                  <SelectTrigger className="w-36 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="font-bold text-lg">${order.total.toFixed(2)}</span>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              {/* Current status badge */}
              <Badge
                variant="outline"
                className={`${statusStyle[order.status] ?? ""} capitalize mb-3`}
              >
                {order.status}
              </Badge>

              {/* Line items */}
              <div className="text-sm space-y-1 mb-3">
                {order.order_items?.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>
                      {item.products?.name ?? "Product"}{" "}
                      <span className="text-muted-foreground">× {item.quantity}</span>
                    </span>
                    <span className="font-medium">
                      ${(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Meta */}
              <div className="text-xs text-muted-foreground space-y-0.5 border-t pt-2">
                {order.payment_method && (
                  <p>Payment: {order.payment_method.replace(/_/g, " ")}</p>
                )}
                {order.shipping_address && (
                  <p>Ship to: {order.shipping_address}</p>
                )}
                <p className="font-mono text-xs opacity-60">User: {order.user_id.slice(0, 8)}</p>
              </div>
            </CardContent>
          </Card>
        ))}

        {orders?.length === 0 && (
          <p className="text-center py-16 text-muted-foreground">No orders yet.</p>
        )}
      </div>
    </div>
  );
};

export default AdminOrders;
