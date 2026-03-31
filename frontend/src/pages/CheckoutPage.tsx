/**
 * pages/CheckoutPage.tsx - Order placement form
 * Collects shipping address and payment method, then creates the order
 */
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCart } from "@/hooks/useCart";
import { useCreateOrder } from "@/hooks/useOrders";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const CheckoutPage = () => {
  const { user }           = useAuth();
  const { cart, cartTotal } = useCart();
  const createOrder        = useCreateOrder();
  const navigate           = useNavigate();

  const [address,       setAddress]       = useState("");
  const [paymentMethod, setPaymentMethod] = useState("credit_card");

  // Guard: must be signed in
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="font-display text-2xl font-bold mb-4">Please sign in to checkout</h2>
        <Button asChild><Link to="/auth">Sign In</Link></Button>
      </div>
    );
  }

  // Guard: must have items
  if (cart.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="font-display text-2xl font-bold mb-4">Your cart is empty</h2>
        <Button asChild><Link to="/products">Shop Now</Link></Button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createOrder.mutateAsync({ shippingAddress: address, paymentMethod });
      navigate("/orders");
    } catch {
      // error toast handled inside useCreateOrder
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="font-display text-3xl font-bold mb-6">Checkout</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Shipping address */}
        <Card>
          <CardHeader>
            <CardTitle>Shipping Address</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Enter your full shipping address&#10;(Street, City, State, ZIP, Country)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              className="min-h-[100px]"
            />
          </CardContent>
        </Card>

        {/* Payment method */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit_card">Credit Card (Simulated)</SelectItem>
                <SelectItem value="paypal">PayPal (Simulated)</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer (Simulated)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Payment is simulated. No real charges will be made.
            </p>
          </CardContent>
        </Card>

        {/* Order summary */}
        <Card>
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cart.map((item) => {
                const itemPrice = parseFloat(String(item.products.price)) || 0;
                return (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>
                    {item.products.name}{" "}
                    <span className="text-muted-foreground">× {item.quantity}</span>
                  </span>
                  <span className="font-medium">
                    ${(itemPrice * item.quantity).toFixed(2)}
                  </span>
                </div>
                );
              })}
              <div className="border-t pt-3 flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-primary">${cartTotal.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={createOrder.isPending}
        >
          {createOrder.isPending
            ? "Placing Order..."
            : `Place Order — $${cartTotal.toFixed(2)}`}
        </Button>
      </form>
    </div>
  );
};

export default CheckoutPage;
