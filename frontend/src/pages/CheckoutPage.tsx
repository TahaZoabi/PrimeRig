/**
 * pages/CheckoutPage.tsx - Order placement via PayPal Sandbox
 *
 * Real PayPal Checkout integration using the official PayPal JS SDK
 * ("Standard" button flow, server-side order creation): the button asks
 * the backend to create a PayPal order (the backend computes the amount —
 * never the frontend), the customer approves it in the PayPal popup, then
 * the backend captures and verifies the payment before an order is ever
 * written to the database. See backend/src/controllers/paymentsController.js.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import {
  useCreatePaypalOrder,
  useCapturePaypalOrder,
} from "@/hooks/usePayments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface PayPalButtonsOptions {
  style?: Record<string, string>;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel?: () => void;
  onError?: (err: unknown) => void;
}
interface PayPalButtonsInstance {
  render: (container: HTMLElement) => void;
  close?: () => void;
}
interface PayPalNamespace {
  Buttons: (options: PayPalButtonsOptions) => PayPalButtonsInstance;
}

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

type PaymentState = "idle" | "processing" | "success" | "error" | "cancelled";

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;

const CheckoutPage = () => {
  const { user } = useAuth();
  const { cart, cartTotal } = useCart();
  const navigate = useNavigate();

  const [address, setAddress] = useState("");
  const addressRef = useRef(address);
  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  const [sdkReady, setSdkReady] = useState(false);
  const [sdkFailed, setSdkFailed] = useState(false);
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const paypalContainerRef = useRef<HTMLDivElement>(null);
  const buttonsInstanceRef = useRef<PayPalButtonsInstance | null>(null);

  const createPaypalOrder = useCreatePaypalOrder();
  const capturePaypalOrder = useCapturePaypalOrder();

  // ── Load the official PayPal JS SDK once ──────────────────────
  useEffect(() => {
    if (!PAYPAL_CLIENT_ID) return;
    if (window.paypal) {
      setSdkReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      PAYPAL_CLIENT_ID,
    )}&currency=USD&intent=capture`;
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setSdkFailed(true);
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // ── Render the PayPal button once the SDK is ready. Runs once — the
  // callbacks below always read the LATEST address via addressRef, so we
  // never need to destroy/recreate the button while the user is typing. ──
  useEffect(() => {
    if (!sdkReady || !window.paypal || !paypalContainerRef.current) return;

    const buttons = window.paypal.Buttons({
      style: {
        layout: "vertical",
        color: "gold",
        shape: "rect",
        label: "paypal",
      },
      createOrder: async () => {
        if (!addressRef.current.trim()) {
          toast.error("Please enter a shipping address first");
          throw new Error("Missing shipping address");
        }
        setPaymentState("processing");
        setPaymentError(null);
        const result = await createPaypalOrder.mutateAsync();
        return result.id;
      },
      onApprove: async (data) => {
        try {
          const result = await capturePaypalOrder.mutateAsync({
            orderID: data.orderID,
            shippingAddress: addressRef.current,
          });
          setPaymentState("success");
          toast.success(
            result.alreadyProcessed
              ? "Payment already processed — order confirmed."
              : "Payment successful! Order placed.",
          );
          navigate("/orders");
        } catch (err) {
          const message =
            (err as { response?: { data?: { error?: string } } })?.response
              ?.data?.error ??
            "Payment could not be verified. No order was created.";
          setPaymentState("error");
          setPaymentError(message);
          toast.error(message);
        }
      },
      onCancel: () => {
        setPaymentState("cancelled");
        toast("Payment cancelled — your cart is unchanged.");
      },
      onError: () => {
        setPaymentState("error");
        setPaymentError("PayPal encountered an error. Please try again.");
        toast.error("PayPal encountered an error. Please try again.");
      },
    });

    buttons.render(paypalContainerRef.current);
    buttonsInstanceRef.current = buttons;

    return () => {
      buttonsInstanceRef.current?.close?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady]);

  // Guard: must be signed in
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="font-display text-2xl font-bold mb-4">
          Please sign in to checkout
        </h2>
        <Button asChild>
          <Link to="/auth">Sign In</Link>
        </Button>
      </div>
    );
  }

  // Guard: must have items — skipped once payment has already succeeded and
  // we're mid-navigation away (the cart is cleared by the backend by then).
  if (cart.length === 0 && paymentState !== "success") {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="font-display text-2xl font-bold mb-4">
          Your cart is empty
        </h2>
        <Button asChild>
          <Link to="/products">Shop Now</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="font-display text-3xl font-bold mb-6">Checkout</h1>

      <div className="space-y-6">
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
              disabled={paymentState === "processing"}
            />
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
                      <span className="text-muted-foreground">
                        × {item.quantity}
                      </span>
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

        {/* Payment */}
        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              You'll be asked to log into a PayPal Sandbox account and approve
              the payment. No real money is ever charged.
            </p>

            {paymentState === "success" ? (
              <div className="flex items-center gap-2 text-green-600 text-sm font-medium py-4">
                <CheckCircle2 className="h-5 w-5" /> Payment successful —
                redirecting to your orders…
              </div>
            ) : (
              <>
                {paymentState === "cancelled" && (
                  <div className="flex items-center gap-2 text-amber-600 text-sm">
                    <AlertCircle className="h-4 w-4" /> Payment cancelled. You
                    can try again below.
                  </div>
                )}
                {paymentState === "error" && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <XCircle className="h-4 w-4" />{" "}
                    {paymentError ?? "Payment failed."}
                  </div>
                )}

                {!PAYPAL_CLIENT_ID ? (
                  <p className="text-sm text-destructive">
                    PayPal isn't configured. Set VITE_PAYPAL_CLIENT_ID in
                    frontend/.env.
                  </p>
                ) : sdkFailed ? (
                  <p className="text-sm text-destructive">
                    Couldn't load PayPal. Check your connection and refresh the
                    page.
                  </p>
                ) : (
                  <>
                    {!address.trim() && (
                      <p className="text-sm text-muted-foreground">
                        Enter your shipping address above, then continue below.
                      </p>
                    )}
                    <div className="relative">
                      {(paymentState === "processing" || !sdkReady) && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 rounded-md min-h-[45px]">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      )}
                      <div ref={paypalContainerRef} />
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CheckoutPage;
