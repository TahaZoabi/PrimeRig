/**
 * hooks/useProducts.ts
 *
 * React Query hooks for fetching products and categories.
 * Replaces Supabase queries with Axios calls to the Express API.
 */

import { useQuery } from "@tanstack/react-query";
import { productsApi, categoriesApi } from "@/lib/api";

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  category_id: string | null;
  supplier_id: string | null;
  specs: Record<string, string> | null;
  socket_type: string | null;
  ddr_type: string | null;
  wattage: number | null;
  form_factor: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined relations (shaped by backend)
  categories: { name: string } | null;
  suppliers: { name: string } | null;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
}

/** Fetch the public product list with optional filters */
export const useProducts = (filters?: {
  categoryId?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
}) => {
  return useQuery<Product[]>({
    queryKey: ["products", filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters?.categoryId) params.categoryId = filters.categoryId;
      if (filters?.search)     params.search     = filters.search;
      if (filters?.minPrice)   params.minPrice   = String(filters.minPrice);
      if (filters?.maxPrice)   params.maxPrice   = String(filters.maxPrice);
      if (filters?.sortBy)     params.sortBy     = filters.sortBy;
      const { data } = await productsApi.list(params);
      return data;
    },
  });
};

/** Fetch a single product by ID */
export const useProduct = (id: string) => {
  return useQuery<Product>({
    queryKey: ["product", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await productsApi.get(id);
      return data;
    },
  });
};

/** Fetch all categories */
export const useCategories = () => {
  return useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await categoriesApi.list();
      return data;
    },
  });
};
