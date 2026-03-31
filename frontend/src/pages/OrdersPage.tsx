/**
 * pages/OrdersPage.tsx - My Orders list
 * Displays all past orders with status badge and line items
 */
import { Link } from "react-router-dom";
import { useOrders } from "@/hooks/useOrders";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Package } from "lucide-react";

/** Tailwind classes for each order status */
const statusStyle: Record<string, string> = {
  pending:    "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  shipped:    "bg-purple-100 text-purple-800 border-purple-200",
  delivered:  "bg-green-100 text-green-800 border-green-200",
  cancelled:  "bg-red-100 text-red-800 border-red-200",
};

const OrdersPage = () => {
  const { user }                    = useAuth();
  const { data: orders, isLoading } = useOrders();

  // Guard: must be signed in
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="font-display text-2xl font-bold mb-4">Sign in to view your orders</h2>
        <Button asChild><Link to="/auth">Sign In</Link></Button>
      </div>
    );
  }

  if (isLoading) return <LoadingSpinner />;

  // Empty state
  if (!orders || orders.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Package className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="font-display text-2xl font-bold mb-2">No orders yet</h2>
        <p className="text-muted-foreground mb-6">Start shopping to place your first order!</p>
        <Button asChild><Link to="/products">Start Shopping</Link></Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-6">My Orders</h1>

      <div className="space-y-4">
        {orders.map((order) => (
          <Card key={order.id}>
            <CardHeader className="flex flex-row items-start justify-between pb-3">
              <div>
                <CardTitle className="text-lg">
                  Order #{order.id.slice(0, 8).toUpperCase()}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(order.created_at).toLocaleDateString("en-US", {
                    year: "numeric", month: "long", day: "numeric",
                  })}
                </p>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <Badge
                  className={`${statusStyle[order.status] ?? ""} border capitalize`}
                  variant="outline"
                >
                  {order.status}
                </Badge>
                <p className="text-lg font-bold text-primary">
                  ${order.total.toFixed(2)}
                </p>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              {/* Line items */}
              <div className="space-y-1 text-sm">
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

              {/* Payment / shipping info */}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-t pt-3">
                {order.payment_method && (
                  <span>Payment: {order.payment_method.replace(/_/g, " ")}</span>
                )}
                {order.shipping_address && (
                  <span>Ship to: {order.shipping_address}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default OrdersPage;
