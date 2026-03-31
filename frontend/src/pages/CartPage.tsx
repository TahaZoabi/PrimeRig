/**
 * pages/CartPage.tsx - Shopping cart view
 * Shows items, quantity controls, totals, checkout button
 */
import { Link } from "react-router-dom";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Plus, Minus, ShoppingBag } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";

const CartPage = () => {
  const { user } = useAuth();
  const { cart, cartTotal, isLoading, updateQuantity, clearCart } = useCart();

  // Guest state
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <ShoppingBag className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="font-display text-2xl font-bold mb-2">Sign in to view your cart</h2>
        <p className="text-muted-foreground mb-6">Your cart is saved when you're logged in.</p>
        <Button asChild>
          <Link to="/auth">Sign In</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) return <LoadingSpinner />;

  // Empty cart
  if (cart.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <ShoppingBag className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="font-display text-2xl font-bold mb-2">Your cart is empty</h2>
        <p className="text-muted-foreground mb-6">Browse our products and add something!</p>
        <Button asChild>
          <Link to="/products">Shop Now</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-6">Shopping Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Cart items ── */}
        <div className="lg:col-span-2 space-y-4">
          {cart.map((item) => {
            const itemPrice = parseFloat(String(item.products.price)) || 0;
            return (
            <Card key={item.id}>
              <CardContent className="flex items-center gap-4 p-4">
                {/* Product image */}
                <Link to={`/products/${item.product_id}`} className="flex-shrink-0">
                  <div className="h-20 w-20 rounded-md bg-muted overflow-hidden">
                    {item.products.image_url ? (
                      <img
                        src={item.products.image_url}
                        alt={item.products.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No img
                      </div>
                    )}
                  </div>
                </Link>

                {/* Name + price */}
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/products/${item.product_id}`}
                    className="font-semibold hover:text-primary transition-colors line-clamp-1"
                  >
                    {item.products.name}
                  </Link>
                  <p className="text-primary font-bold mt-1">
                    ${itemPrice.toFixed(2)}
                  </p>
                </div>

                {/* Quantity controls */}
                <div className="flex items-center border rounded-md flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      updateQuantity.mutate({ itemId: item.id, quantity: item.quantity - 1 })
                    }
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="px-3 text-sm font-medium">{item.quantity}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      updateQuantity.mutate({ itemId: item.id, quantity: item.quantity + 1 })
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {/* Line total */}
                <p className="font-bold w-20 text-right flex-shrink-0">
                  ${(itemPrice * item.quantity).toFixed(2)}
                </p>

                {/* Remove button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0"
                  onClick={() => updateQuantity.mutate({ itemId: item.id, quantity: 0 })}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
            );
          })}

          <Button
            variant="outline"
            size="sm"
            onClick={() => clearCart.mutate()}
            disabled={clearCart.isPending}
          >
            Clear Cart
          </Button>
        </div>

        {/* ── Order summary ── */}
        <Card className="h-fit">
          <CardContent className="p-6">
            <h2 className="font-display text-xl font-bold mb-4">Order Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${cartTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="text-green-600 font-medium">Free</span>
              </div>
              <div className="border-t pt-3 flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-primary">${cartTotal.toFixed(2)}</span>
              </div>
            </div>
            <Button className="w-full mt-6" size="lg" asChild>
              <Link to="/checkout">Proceed to Checkout</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CartPage;
