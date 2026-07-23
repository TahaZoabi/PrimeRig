/**
 * hooks/useOrders.ts
 *
 * Order fetching hooks. Order *creation* now happens exclusively through
 * the PayPal payment flow — see hooks/usePayments.ts — since the backend
 * only ever creates an order after verifying a real PayPal capture.
 */

import { useQuery } from "@tanstack/react-query";
import { ordersApi } from "@/lib/api";
import { useAuth } from "./useAuth";

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  products: { name: string; image_url?: string | null };
}

export interface Order {
  id: string;
  user_id: string;
  status: string;
  total: number;
  shipping_address: string | null;
  payment_method: string | null;
  payment_status: string;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  order_items: OrderItem[];
}

/** Fetch the authenticated user's orders */
export const useOrders = () => {
  const { user } = useAuth();
  return useQuery<Order[]>({
    queryKey: ["orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await ordersApi.myOrders();
      return data;
    },
  });
};
