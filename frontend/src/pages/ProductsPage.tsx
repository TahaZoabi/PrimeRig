/**
 * pages/ProductsPage.tsx - Full product catalog with search, category, sort, price filters
 */
import { useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useProducts, useCategories } from "@/hooks/useProducts";
import ProductCard from "@/components/ProductCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, SlidersHorizontal } from "lucide-react";

const ProductsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [search,     setSearch]     = useState(searchParams.get("search") || "");
  const [categoryId, setCategoryId] = useState(searchParams.get("categoryId") || "");
  const [sortBy,     setSortBy]     = useState("newest");
  const [minPrice,   setMinPrice]   = useState("");
  const [maxPrice,   setMaxPrice]   = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Sync search from URL (navbar redirect)
  useEffect(() => {
    setSearch(searchParams.get("search") || "");
    setCategoryId(searchParams.get("categoryId") || "");
  }, [searchParams]);

  const { data: products, isLoading } = useProducts({
    search:     search     || undefined,
    categoryId: categoryId || undefined,
    sortBy,
    minPrice:   minPrice ? Number(minPrice) : undefined,
    maxPrice:   maxPrice ? Number(maxPrice) : undefined,
  });

  const { data: categories } = useCategories();

  const clearFilters = () => {
    setSearch(""); setCategoryId(""); setSortBy("newest");
    setMinPrice(""); setMaxPrice("");
    setSearchParams({});
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-6">Products</h1>

      {/* ── Filters toolbar ── */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Category */}
        <Select
          value={categoryId || "all"}
          onValueChange={(v) => setCategoryId(v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="price_asc">Price: Low to High</SelectItem>
            <SelectItem value="price_desc">Price: High to Low</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
          <SlidersHorizontal className="h-4 w-4 mr-2" /> Filters
        </Button>
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-muted rounded-lg animate-fade-in">
          <Input
            type="number"
            placeholder="Min Price ($)"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-36"
          />
          <Input
            type="number"
            placeholder="Max Price ($)"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-36"
          />
          <Button variant="ghost" onClick={clearFilters}>
            Clear All
          </Button>
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            {products?.length ?? 0} product{products?.length !== 1 ? "s" : ""} found
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products?.map((p) => (
              <ProductCard
                key={p.id}
                id={p.id}
                name={p.name}
                price={p.price}
                image_url={p.image_url}
                stock={p.stock}
                category={p.categories?.name}
              />
            ))}
          </div>
          {products?.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              No products found matching your criteria.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ProductsPage;
