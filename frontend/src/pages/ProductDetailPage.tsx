/**
 * pages/ProductDetailPage.tsx - Single product view
 * Shows image, description, specs table, quantity picker, add-to-cart
 */
import { useParams } from "react-router-dom";
import { useState } from "react";
import { useProduct } from "@/hooks/useProducts";
import { useCart } from "@/hooks/useCart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/LoadingSpinner";
import { ShoppingCart, Minus, Plus } from "lucide-react";

const ProductDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading } = useProduct(id!);
  const { addToCart } = useCart();
  const [qty, setQty] = useState(1);

  if (isLoading) return <LoadingSpinner />;
  if (!product) {
    return (
      <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">
        Product not found.
      </div>
    );
  }

  const safePrice = parseFloat(String(product.price)) || 0;
  const safeStock = parseInt(String(product.stock), 10) || 0;

  // Safely parse specs — may arrive as a JSON string from the API
  let specs: Record<string, string> | null = null;
  if (product.specs) {
    if (typeof product.specs === "string") {
      try {
        specs = JSON.parse(product.specs);
      } catch {
        specs = null;
      }
    } else if (typeof product.specs === "object") {
      specs = product.specs as Record<string, string>;
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* ── Product Image ── */}
        <div className="aspect-square overflow-hidden rounded-xl bg-muted">
          <img
            src={product.image_url || "/images/products/placeholder.jpg"}
            alt={product.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "/images/products/placeholder.jpg";
            }}
          />
        </div>

        {/* ── Product Details ── */}
        <div className="flex flex-col">
          {/* Category badge */}
          {product.categories?.name && (
            <Badge variant="secondary" className="w-fit mb-3">
              {product.categories.name}
            </Badge>
          )}

          <h1 className="font-display text-3xl font-bold mb-2">
            {product.name}
          </h1>
          <p className="text-3xl font-bold text-primary mb-4">
            ${safePrice.toFixed(2)}
          </p>

          {/* Stock + supplier row */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            {safeStock === 0 ? (
              <span className="text-sm font-medium text-destructive">
                Out of Stock
              </span>
            ) : safeStock <= 5 ? (
              <span className="text-sm font-medium text-amber-600">
                ⚠ Only {safeStock} left in stock
              </span>
            ) : (
              <span className="text-sm font-medium text-green-600">
                ✓ {safeStock} in stock
              </span>
            )}
            {product.suppliers?.name && (
              <span className="text-sm text-muted-foreground">
                • Sold by {product.suppliers.name}
              </span>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <p className="text-muted-foreground mb-6 leading-relaxed">
              {product.description}
            </p>
          )}

          {/* PC-builder compatibility fields */}
          {product.socket_type && (
            <p className="text-sm mb-1">
              <span className="font-medium">Socket:</span> {product.socket_type}
            </p>
          )}
          {product.ddr_type && (
            <p className="text-sm mb-1">
              <span className="font-medium">DDR Type:</span> {product.ddr_type}
            </p>
          )}
          {!!product.wattage && product.wattage > 0 && (
            <p className="text-sm mb-1">
              <span className="font-medium">Wattage:</span> {product.wattage}W
            </p>
          )}
          {product.form_factor && (
            <p className="text-sm mb-4">
              <span className="font-medium">Form Factor:</span>{" "}
              {product.form_factor}
            </p>
          )}

          {/* Specs table */}
          {specs && Object.keys(specs).length > 0 && (
            <div className="border rounded-lg p-4 mb-6">
              <h3 className="font-semibold mb-3">Specifications</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(specs).map(([key, val]) => (
                  <div key={key}>
                    <span className="text-muted-foreground">{key}:</span>{" "}
                    <span className="font-medium">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quantity + Add to Cart */}
          <div className="flex items-center gap-4 mt-auto">
            <div className="flex items-center border rounded-md">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                disabled={safeStock <= 0}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={safeStock}
                step={1}
                value={qty}
                disabled={safeStock <= 0}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setQty(1);
                    return;
                  }
                  const parsed = Math.trunc(Number(raw));
                  if (Number.isNaN(parsed)) return;
                  setQty(Math.min(Math.max(1, parsed), Math.max(safeStock, 1)));
                }}
                className="w-14 px-1 py-2 text-center font-medium bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                disabled={safeStock <= 0}
                onClick={() => setQty((q) => Math.min(safeStock, q + 1))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              size="lg"
              className="flex-1"
              disabled={safeStock <= 0 || addToCart.isPending}
              onClick={() =>
                addToCart.mutate({ productId: product.id, quantity: qty })
              }
            >
              <ShoppingCart className="mr-2 h-5 w-5" />
              {safeStock <= 0 ? "Out of Stock" : "Add to Cart"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailPage;
