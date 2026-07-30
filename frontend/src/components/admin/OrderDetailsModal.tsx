/**
 * components/admin/OrderDetailsModal.tsx
 *
 * Professional order detail view, opened from a click on any order in
 * AdminOrders.tsx. Fetches the full detail (customer info + status
 * timeline) on demand via GET /api/admin/orders/:id, rather than the
 * lighter-weight list endpoint used for the Orders tab itself.
 *
 * This app has no tax engine and always ships for free (see CartPage.tsx),
 * so the invoice's Tax/Shipping lines reflect that honestly rather than
 * fabricating numbers this app doesn't actually compute.
 */
import { useQuery } from "@tanstack/react-query";
import { ordersApi } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  User,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Hash,
  Calendar,
  Printer,
  Download,
  CheckCircle2,
  Circle,
} from "lucide-react";

const statusStyle: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100   text-blue-800   border-blue-200",
  shipped: "bg-purple-100 text-purple-800 border-purple-200",
  delivered: "bg-green-100  text-green-800  border-green-200",
  cancelled: "bg-red-100    text-red-800    border-red-200",
};

interface OrderDetailItem {
  id: string;
  quantity: number;
  price: number;
  products: { name: string; image_url?: string | null } | null;
}

interface OrderDetail {
  id: string;
  status: string;
  total: number;
  shipping_address: string | null;
  payment_method: string | null;
  payment_status: string;
  paypal_capture_id: string | null;
  paid_at: string | null;
  created_at: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  order_items: OrderDetailItem[];
  status_history: { status: string; created_at: string }[];
}

interface OrderDetailsModalProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmt = (n: number) => `$${n.toFixed(2)}`;

const OrderDetailsModal = ({
  orderId,
  open,
  onOpenChange,
}: OrderDetailsModalProps) => {
  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ["admin-order-details", orderId],
    queryFn: async () => {
      const { data } = await ordersApi.getDetails(orderId as string);
      return data;
    },
    enabled: open && !!orderId,
  });

  const shortId = order ? order.id.slice(0, 8).toUpperCase() : "";
  const subtotal =
    order?.order_items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    ) ?? 0;

  const findStageDate = (status: string) =>
    order?.status_history.find((h) => h.status === status)?.created_at ?? null;

  const stages = order
    ? [
        { label: "Created", date: order.created_at as string | null },
        { label: "Paid", date: order.paid_at },
        { label: "Processing", date: findStageDate("processing") },
        { label: "Shipped", date: findStageDate("shipped") },
        { label: "Delivered", date: findStageDate("delivered") },
      ]
    : [];

  const handlePrint = () => window.print();

  const handleDownloadPdf = async () => {
    if (!order) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    let y = 18;

    doc.setFontSize(18);
    doc.text("PrimeRig — Invoice", 14, y);
    y += 10;
    doc.setFontSize(10);
    doc.text(`Order #${shortId}`, 14, y);
    doc.text(
      `Date: ${new Date(order.created_at).toLocaleDateString()}`,
      120,
      y,
    );
    y += 6;
    doc.text(`Status: ${order.status}`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text("Customer", 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.text(order.customer_name || "—", 14, y);
    y += 5;
    doc.text(order.customer_email || "—", 14, y);
    y += 5;
    doc.text(order.customer_phone || "—", 14, y);
    y += 8;

    doc.setFontSize(12);
    doc.text("Ship To", 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.text(order.shipping_address || "—", 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text("Items", 14, y);
    y += 6;
    doc.setFontSize(10);
    order.order_items.forEach((item) => {
      const name = item.products?.name ?? "Product";
      doc.text(`${name} × ${item.quantity}`, 14, y);
      doc.text(fmt(item.price * item.quantity), 170, y, { align: "right" });
      y += 6;
    });
    y += 4;

    doc.text("Subtotal", 14, y);
    doc.text(fmt(subtotal), 170, y, { align: "right" });
    y += 6;
    doc.text("Shipping", 14, y);
    doc.text("Free", 170, y, { align: "right" });
    y += 6;
    doc.setFontSize(12);
    doc.text("Total", 14, y);
    doc.text(fmt(order.total), 170, y, { align: "right" });

    doc.save(`invoice-${shortId}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order Details</DialogTitle>
        </DialogHeader>

        {isLoading || !order ? (
          <LoadingSpinner />
        ) : (
          <div id="invoice-printable" className="space-y-6">
            {/* Order Information */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">Order #{shortId}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(order.created_at).toLocaleString()}
                </span>
                <Badge
                  variant="outline"
                  className={`${statusStyle[order.status] ?? ""} capitalize`}
                >
                  {order.status}
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Customer + Shipping + Payment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Customer Information
                </p>
                <div className="space-y-1 text-sm">
                  <p className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    {order.customer_name || "—"}
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    {order.customer_email || "—"}
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {order.customer_phone || "—"}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Shipping Information
                </p>
                <p className="flex items-start gap-2 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  {order.shipping_address || "—"}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Payment Information
                </p>
                <div className="space-y-1 text-sm">
                  <p className="flex items-center gap-2">
                    <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                    {order.payment_method
                      ? order.payment_method.replace(/_/g, " ")
                      : "—"}
                  </p>
                  <p>
                    Status:{" "}
                    <span
                      className={
                        order.payment_status === "paid"
                          ? "text-green-600 font-medium"
                          : "text-amber-600 font-medium"
                      }
                    >
                      {order.payment_status}
                    </span>
                  </p>
                  {order.paypal_capture_id && (
                    <p className="font-mono text-xs break-all">
                      PayPal Txn: {order.paypal_capture_id}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Purchased Products */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Purchased Products
              </p>
              <div className="space-y-2">
                {order.order_items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-muted overflow-hidden flex-shrink-0">
                      {item.products?.image_url && (
                        <img
                          src={item.products.image_url}
                          alt={item.products.name}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1">
                        {item.products?.name ?? "Product"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Qty {item.quantity} · {fmt(item.price)} each
                      </p>
                    </div>
                    <span className="text-sm font-semibold flex-shrink-0">
                      {fmt(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Totals */}
            <div className="space-y-1 text-sm ml-auto max-w-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="text-green-600">Free</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="text-muted-foreground">N/A</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-1">
                <span>Grand Total</span>
                <span className="text-primary">{fmt(order.total)}</span>
              </div>
            </div>

            <Separator />

            {/* Order Timeline */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Order Timeline
              </p>
              <div className="space-y-3">
                {stages.map((stage) => (
                  <div key={stage.label} className="flex items-center gap-3">
                    {stage.date ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                    )}
                    <span
                      className={
                        stage.date
                          ? "text-sm font-medium"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      {stage.label}
                    </span>
                    {stage.date && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(stage.date).toLocaleString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={!order}
          >
            <Printer className="mr-2 h-4 w-4" /> Print Invoice
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={!order}
          >
            <Download className="mr-2 h-4 w-4" /> Download Invoice PDF
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>

      {/* Scoped print styles: only the invoice content prints, not the rest of the page */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-printable, #invoice-printable * { visibility: visible; }
          #invoice-printable { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </Dialog>
  );
};

export default OrderDetailsModal;
