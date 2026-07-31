/**
 * components/admin/OrderFromSupplierDialog.tsx
 *
 * Shared "Order From Supplier" dialog — lets an admin manually create a
 * Purchase Order for a product, choosing the supplier (defaults to the
 * product's Preferred Supplier, falling back to its regular Supplier) and
 * quantity. Reused from both AdminProducts.tsx (every product) and
 * AdminInventory.tsx (Low Stock / Out of Stock lists).
 *
 * This only ever creates a Purchase Order record — it never contacts a real
 * supplier and never changes stock directly (stock only increases once the
 * resulting Purchase Order is marked Received).
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { purchaseOrdersApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export interface OrderFromSupplierProduct {
  id: string;
  name: string;
  supplier_id?: string | null;
  preferred_supplier_id?: string | null;
}

interface SupplierOption {
  id: string;
  name: string;
  is_active?: boolean;
}

interface OrderFromSupplierDialogProps {
  product: OrderFromSupplierProduct | null;
  suppliers: SupplierOption[] | undefined;
  onOpenChange: (open: boolean) => void;
}

const OrderFromSupplierDialog = ({
  product,
  suppliers,
  onOpenChange,
}: OrderFromSupplierDialogProps) => {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [quantity, setQuantity] = useState("10");

  useEffect(() => {
    if (product) {
      setSupplierId(product.preferred_supplier_id || product.supplier_id || "");
      setQuantity("10");
    }
  }, [product]);

  const createPo = useMutation({
    mutationFn: async () => {
      if (!product) return;
      await purchaseOrdersApi.create({
        product_id: product.id,
        supplier_id: supplierId || undefined,
        quantity: Number(quantity),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-overview"] });
      toast.success(`Purchase order created for ${product?.name}`);
      onOpenChange(false);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(
        err?.response?.data?.error ?? "Failed to create purchase order",
      );
    },
  });

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Order From Supplier</DialogTitle>
        </DialogHeader>
        {product && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Create a purchase order for{" "}
              <span className="font-medium text-foreground">
                {product.name}
              </span>
              . This does not place a real order — it only records one for you
              to track and receive.
            </p>

            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.is_active === false ? " (Archived)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="number"
              placeholder="Quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="1"
            />

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  !supplierId ||
                  !quantity ||
                  Number(quantity) <= 0 ||
                  createPo.isPending
                }
                onClick={() => createPo.mutate()}
              >
                Create Purchase Order
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OrderFromSupplierDialog;
