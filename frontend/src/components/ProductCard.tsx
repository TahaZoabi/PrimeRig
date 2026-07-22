/**
 * ProductCard - reusable card showing product info + add-to-cart button
 * Used on: Index (featured), ProductsPage grid
 */
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/hooks/useCart";

interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  stock: number;
  category?: string | null;
}

const ProductCard = ({
  id,
  name,
  price,
  image_url,
  stock,
  category,
}: ProductCardProps) => {
  const { addToCart } = useCart();
  // Defensively cast — MySQL DECIMAL can arrive as string if not cast server-side
  const safePrice = parseFloat(String(price)) || 0;
  const safeStock = parseInt(String(stock), 10) || 0;

  return (
    <Card className="card-hover overflow-hidden group">
      {/* Image */}
      <Link to={`/products/${id}`}>
        <div className="aspect-square overflow-hidden bg-muted">
          {image_url ? (
            <img
              src={image_url}
              alt={name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "/images/products/placeholder.jpg";
              }}
            />
          ) : (
            <img
              src="/images/products/placeholder.jpg"
              alt={name}
              className="h-full w-full object-cover"
            />
          )}
        </div>
      </Link>

      <CardContent className="p-4">
        {/* Category badge */}
        {category && (
          <Badge variant="secondary" className="mb-2 text-xs">
            {category}
          </Badge>
        )}

        {/* Product name */}
        <Link to={`/products/${id}`}>
          <h3 className="font-semibold line-clamp-2 hover:text-primary transition-colors leading-snug">
            {name}
          </h3>
        </Link>

        {/* Price + stock row */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-lg font-bold text-primary">
            ${safePrice.toFixed(2)}
          </span>
          {safeStock === 0 ? (
            <span className="text-xs font-medium text-destructive">
              Out of stock
            </span>
          ) : safeStock <= 5 ? (
            <span className="text-xs font-medium text-amber-600">
              Only {safeStock} left
            </span>
          ) : (
            <span className="text-xs font-medium text-green-600">
              {safeStock} in stock
            </span>
          )}
        </div>

        {/* Add to Cart */}
        <Button
          className="mt-3 w-full"
          size="sm"
          disabled={safeStock <= 0 || addToCart.isPending}
          onClick={() => addToCart.mutate({ productId: id })}
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          {safeStock <= 0 ? "Out of Stock" : "Add to Cart"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default ProductCard;
