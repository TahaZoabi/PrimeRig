/**
 * hooks/useCart.ts
 *
 * Cart management via React Query mutations.
 * Replaces Supabase cart operations with REST API calls.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cartApi } from "@/lib/api";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface CartItemWithProduct {
  id: string;
  quantity: number;
  product_id: string;
  products: {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    stock: number;
  };
}

export const useCart = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch cart — only when logged in
  const cartQuery = useQuery<CartItemWithProduct[]>({
    queryKey: ["cart", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await cartApi.get();
      return data;
    },
  });

  // Add item (or increment quantity if exists)
  const addToCart = useMutation({
    mutationFn: async ({ productId, quantity = 1 }: { productId: string; quantity?: number }) => {
      if (!user) throw new Error("Please sign in to add items to cart");
      await cartApi.add(productId, quantity);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      toast.success("Added to cart!");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not add to cart");
    },
  });

  // Update quantity (quantity=0 removes the item)
  const updateQuantity = useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      await cartApi.update(itemId, quantity);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update cart");
    },
  });

  // Clear all items
  const clearCart = useMutation({
    mutationFn: async () => {
      await cartApi.clear();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });

  const cartTotal = cartQuery.data?.reduce(
    (sum, item) => sum + (parseFloat(String(item.products.price)) || 0) * item.quantity,
    0
  ) ?? 0;

  const cartCount = cartQuery.data?.reduce(
    (sum, item) => sum + (parseInt(String(item.quantity), 10) || 0),
    0
  ) ?? 0;

  return {
    cart: cartQuery.data ?? [],
    cartTotal,
    cartCount,
    isLoading: cartQuery.isLoading,
    addToCart,
    updateQuantity,
    clearCart,
  };
};
