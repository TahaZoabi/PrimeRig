/**
 * components/admin/AdminOrders.tsx
 * View orders (filterable by the same date-range periods as the Overview
 * dashboard) and update their status via dropdown.
 *
 * Filter state is owned by AdminPage (see PeriodFilterState) so it survives
 * switching tabs, and is passed down here as controlled props — independent
 * from the Overview tab's own filter.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ordersApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PeriodFilter, {
  type PeriodOption,
} from "@/components/admin/PeriodFilter";
import type { PeriodFilterState } from "@/pages/AdminPage";
import { AlertTriangle, RefreshCw, PackageOpen } from "lucide-react";
import { toast } from "sonner";

// Same underlying period keys as the Overview dashboard's filter — this tab
// just exposes a smaller set of options, per the requested list for Orders.
const PERIOD_OPTIONS: PeriodOption[] = [
  { value: "7d", label: "Last Week" },
  { value: "30d", label: "Last Month" },
  { value: "3m", label: "Last 3 Months" },
  { value: "1y", label: "Last Year" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

// Mirrors the backend's ALLOWED_TRANSITIONS — the backend is the source of
// truth and re-validates regardless, but showing only valid next statuses
// here means the admin can't even attempt an invalid skip in the first place.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

const statusStyle: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100   text-blue-800   border-blue-200",
  shipped: "bg-purple-100 text-purple-800 border-purple-200",
  delivered: "bg-green-100  text-green-800  border-green-200",
  cancelled: "bg-red-100    text-red-800    border-red-200",
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

interface AdminOrdersProps {
  filter: PeriodFilterState;
  onFilterChange: (next: PeriodFilterState) => void;
}

const AdminOrders = ({ filter, onFilterChange }: AdminOrdersProps) => {
  const { period, customStart, customEnd } = filter;
  const customReady = customStart !== "" && customEnd !== "";
  const canQuery = period !== "custom" || customReady;

  const queryClient = useQueryClient();

  const {
    data: orders,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery<AdminOrder[]>({
    queryKey: [
      "admin-orders",
      period,
      period === "custom" ? customStart : null,
      period === "custom" ? customEnd : null,
    ],
    queryFn: async () => {
      const { data } = await ordersApi.adminList({
        period,
        ...(period === "custom"
          ? { startDate: customStart, endDate: customEnd }
          : {}),
      });
      return data;
    },
    enabled: canQuery,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await ordersApi.updateStatus(id, status);
    },
    onSuccess: () => {
      // Only this tab's own filtered order list needs to refresh — Overview's
      // stats query has its own independent key and is untouched.
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("Order status updated");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(
        err?.response?.data?.error ?? "Failed to update order status",
      );
    },
  });

  return (
    <div className="space-y-4">
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
          Pick a start and end date to see orders from that range.
        </p>
      ) : isPending ? (
        <OrdersSkeleton />
      ) : isError ? (
        <ErrorState
          message={
            (error as { response?: { data?: { error?: string } } })?.response
              ?.data?.error ?? "Couldn't load orders."
          }
          onRetry={() => refetch()}
        />
      ) : orders && orders.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {orders?.length ?? 0} order{orders?.length === 1 ? "" : "s"} in this
            period
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
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Status updater */}
                    <Select
                      value={order.status}
                      onValueChange={(status) =>
                        updateStatus.mutate({ id: order.id, status })
                      }
                    >
                      <SelectTrigger className="w-36 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          order.status,
                          ...(ALLOWED_TRANSITIONS[order.status] ?? []),
                        ].map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <span className="font-bold text-lg">
                      ${order.total.toFixed(2)}
                    </span>
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
                          <span className="text-muted-foreground">
                            × {item.quantity}
                          </span>
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
                    <p className="font-mono text-xs opacity-60">
                      User: {order.user_id.slice(0, 8)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/** Shown once, on first load per filter selection. */
const OrdersSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="h-40 rounded-lg bg-muted" />
    ))}
  </div>
);

/** Shown when the orders request fails for any reason — always gives a way back out. */
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

/** Friendly empty state instead of a blank list when there are no orders in the selected period. */
const EmptyState = () => (
  <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
    <PackageOpen className="h-8 w-8" />
    <p className="font-medium">No orders in this period</p>
    <p className="text-sm">Try a wider date range, or check back later.</p>
  </div>
);

export default AdminOrders;
