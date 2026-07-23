/**
 * hooks/usePayments.ts
 *
 * PayPal order create/capture mutations. This is the only path that ever
 * creates a real order now — the backend verifies the PayPal capture
 * before writing anything to the database.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { paymentsApi } from "@/lib/api";

export interface ApiError extends Error {
  response?: { data?: { error?: string } };
}

/** Step 1: ask the backend to create a PayPal order for the current cart total. */
export const useCreatePaypalOrder = () => {
  return useMutation({
    mutationFn: async () => {
      const { data } = await paymentsApi.createPaypalOrder();
      return data as { id: string };
    },
  });
};

/** Step 2: after the customer approves in the PayPal popup, capture the payment. */
export const useCapturePaypalOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { orderID: string; shippingAddress: string }) => {
      const { data } = await paymentsApi.capturePaypalOrder(vars);
      return data as { id: string; alreadyProcessed: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });
};
