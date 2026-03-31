/**
 * pages/PCBuilderPage.tsx - Custom PC Builder
 *
 * Lets users pick components for 7 PC part categories.
 * Performs real-time compatibility checks:
 *   - CPU socket ↔ Motherboard socket
 *   - RAM DDR type ↔ Motherboard DDR type
 *   - Total wattage ↔ PSU capacity
 *
 * On "Add All to Cart" — fires addToCart for every selected product.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { productsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/hooks/useCart";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  Cpu, Monitor, HardDrive, Zap, Box, AlertTriangle, CheckCircle, ShoppingCart,
} from "lucide-react";
import type { Product } from "@/hooks/useProducts";

// ── Category definitions ──────────────────────────────────────
const PC_CATEGORIES = [
  { key: "cpu",         label: "CPU / Processor",  icon: Cpu     },
  { key: "gpu",         label: "Graphics Card",     icon: Monitor },
  { key: "motherboard", label: "Motherboard",        icon: Box     },
  { key: "ram",         label: "RAM / Memory",       icon: Box     },
  { key: "storage",     label: "Storage",            icon: HardDrive },
  { key: "psu",         label: "Power Supply",       icon: Zap     },
  { key: "case",        label: "Case",               icon: Box     },
] as const;

type CategoryKey = typeof PC_CATEGORIES[number]["key"];
type SelectedParts = Partial<Record<CategoryKey, string>>; // key → product id

const PCBuilderPage = () => {
  const [selected, setSelected] = useState<SelectedParts>({});
  const { addToCart } = useCart();

  // Fetch all active, in-stock products (uses /api/products/builder)
  const { data: allProducts, isLoading } = useQuery<Product[]>({
    queryKey: ["pc-builder-products"],
    queryFn: async () => {
      const { data } = await productsApi.builder();
      return data;
    },
  });

  // Group products by category key (case-insensitive match on category name)
  const productsByCategory = useMemo(() => {
    if (!allProducts) return {} as Record<CategoryKey, Product[]>;
    const map = {} as Record<CategoryKey, Product[]>;
    for (const cat of PC_CATEGORIES) {
      map[cat.key] = allProducts.filter((p) => {
        const catName = p.categories?.name?.toLowerCase() ?? "";
        return catName.includes(cat.key);
      });
    }
    return map;
  }, [allProducts]);

  // Resolve selected product objects
  const selectedProducts = useMemo(() => {
    const result = {} as Record<CategoryKey, Product | undefined>;
    for (const cat of PC_CATEGORIES) {
      const id = selected[cat.key];
      result[cat.key] = id ? allProducts?.find((p) => p.id === id) : undefined;
    }
    return result;
  }, [selected, allProducts]);

  // ── Compatibility warnings ──────────────────────────────────
  const warnings = useMemo(() => {
    const w: string[] = [];
    const cpu = selectedProducts.cpu;
    const mb  = selectedProducts.motherboard;
    const ram = selectedProducts.ram;
    const psu = selectedProducts.psu;

    // CPU ↔ Motherboard socket
    if (cpu && mb && cpu.socket_type && mb.socket_type && cpu.socket_type !== mb.socket_type) {
      w.push(`CPU socket (${cpu.socket_type}) doesn't match Motherboard socket (${mb.socket_type})`);
    }

    // RAM ↔ Motherboard DDR type
    if (ram && mb && ram.ddr_type && mb.ddr_type && ram.ddr_type !== mb.ddr_type) {
      w.push(`RAM type (${ram.ddr_type}) doesn't match Motherboard DDR support (${mb.ddr_type})`);
    }

    // Total wattage ↔ PSU capacity
    if (psu?.wattage) {
      const psuWatts = parseInt(String(psu.wattage), 10) || 0;
      const consumed = Object.values(selectedProducts).reduce((sum, p) => {
        if (!p || p.id === psu.id) return sum;
        return sum + (parseInt(String(p.wattage), 10) || 0);
      }, 0);
      if (psuWatts > 0 && consumed > psuWatts) {
        w.push(`Total system wattage (${consumed}W) exceeds PSU capacity (${psuWatts}W)`);
      }
    }

    return w;
  }, [selectedProducts]);

  // ── Derived totals ──────────────────────────────────────────
  const totalPrice = useMemo(
    () => Object.values(selectedProducts).reduce((s, p) => s + (parseFloat(String(p?.price)) || 0), 0),
    [selectedProducts]
  );

  const totalWattage = useMemo(
    () => Object.values(selectedProducts).reduce((s, p) => s + (parseInt(String(p?.wattage), 10) || 0), 0),
    [selectedProducts]
  );

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const isComplete    = PC_CATEGORIES.every((c) => selected[c.key]);

  // Add every selected part to cart
  const addAllToCart = async () => {
    const ids = Object.values(selected).filter(Boolean) as string[];
    for (const productId of ids) {
      await addToCart.mutateAsync({ productId });
    }
  };

  // Toggle a selection (choose "none" removes the key)
  const handleSelect = (key: CategoryKey, value: string) => {
    setSelected((prev) => {
      if (value === "none") {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2">PC Builder</h1>
        <p className="text-muted-foreground">
          Select compatible components to build your custom PC.
          We'll check compatibility for you in real time.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Component selectors ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-3">
          {PC_CATEGORIES.map(({ key, label, icon: Icon }) => {
            const products       = productsByCategory[key] ?? [];
            const selectedProduct = selectedProducts[key];

            return (
              <Card
                key={key}
                className={`transition-colors ${selected[key] ? "border-primary/60 bg-primary/5" : ""}`}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  {/* Category icon */}
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
                    <Icon className="h-6 w-6" />
                  </div>

                  {/* Label + Select */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm mb-1">{label}</p>
                    {products.length > 0 ? (
                      <Select
                        value={selected[key] ?? "none"}
                        onValueChange={(v) => handleSelect(key, v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={`Choose ${label}`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} — ${p.price.toFixed(2)}
                              {p.socket_type ? ` (${p.socket_type})` : ""}
                              {p.ddr_type    ? ` (${p.ddr_type})`    : ""}
                              {p.wattage     ? ` (${p.wattage}W)`    : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        No {label} products available
                      </p>
                    )}
                  </div>

                  {/* Selected price */}
                  {selectedProduct && (
                    <span className="font-bold text-primary flex-shrink-0">
                      ${selectedProduct.price.toFixed(2)}
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Summary sidebar ──────────────────────────────────── */}
        <div className="space-y-4">
          {/* Build summary card */}
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Build Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Components</span>
                <span>{selectedCount} / {PC_CATEGORIES.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Est. Wattage</span>
                <span>{totalWattage}W</span>
              </div>
              <div className="border-t pt-3 flex justify-between font-bold text-xl">
                <span>Total</span>
                <span className="text-primary">${totalPrice.toFixed(2)}</span>
              </div>

              {/* Compatibility status */}
              {warnings.length > 0 ? (
                <div className="space-y-2">
                  {warnings.map((w, i) => (
                    <Alert key={i} variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm">⚠️ {w}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              ) : selectedCount >= 2 ? (
                <Alert className="border-green-200 bg-green-50 text-green-800">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-sm text-green-700">
                    All selected parts are compatible!
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button
                className="w-full"
                size="lg"
                disabled={selectedCount === 0 || addToCart.isPending}
                onClick={addAllToCart}
              >
                <ShoppingCart className="mr-2 h-5 w-5" />
                Add All to Cart
              </Button>

              {!isComplete && selectedCount > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  Select all {PC_CATEGORIES.length} components for a complete build
                </p>
              )}
            </CardContent>
          </Card>

          {/* Selected parts list */}
          {selectedCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Selected Parts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {PC_CATEGORIES.map(({ key, label }) => {
                  const p = selectedProducts[key];
                  if (!p) return null;
                  return (
                    <div key={key} className="flex justify-between items-start gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <span className="text-muted-foreground text-xs">{label}</span>
                        <p className="font-medium line-clamp-1 leading-tight">{p.name}</p>
                        {/* Show compatibility badges */}
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {p.socket_type && (
                            <Badge variant="outline" className="text-xs py-0">{p.socket_type}</Badge>
                          )}
                          {p.ddr_type && (
                            <Badge variant="outline" className="text-xs py-0">{p.ddr_type}</Badge>
                          )}
                          {p.wattage ? (
                            <Badge variant="outline" className="text-xs py-0">{p.wattage}W</Badge>
                          ) : null}
                        </div>
                      </div>
                      <span className="font-semibold flex-shrink-0">${p.price.toFixed(2)}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default PCBuilderPage;
