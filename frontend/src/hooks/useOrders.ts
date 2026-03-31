/**
 * hooks/useOrders.ts
 *
 * Order fetching and creation hooks.
 * Replaces Supabase order operations with REST API calls.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ordersApi } from "@/lib/api";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

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

/** Mutation to place a new order from the current cart */
export const useCreateOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shippingAddress,
      paymentMethod,
    }: {
      shippingAddress: string;
      paymentMethod: string;
    }) => {
      const { data } = await ordersApi.create({ shippingAddress, paymentMethod });
      return data;
    },
    onSuccess: () => {
      // Invalidate both orders and cart caches
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      toast.success("Order placed successfully!");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to place order");
    },
  });
};
