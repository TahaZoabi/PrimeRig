/**
 * pages/Index.tsx - Landing page
 * Sections: Hero, Shop by Category, Featured Products, PC Builder CTA
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCategories, useProducts } from "@/hooks/useProducts";
import ProductCard from "@/components/ProductCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Monitor, Cpu, HardDrive, Zap, ArrowRight, Keyboard, Mouse, Headphones, Box } from "lucide-react";

/** Map category names to Lucide icons */
const categoryIcons: Record<string, React.ReactNode> = {
  cpu:         <Cpu className="h-8 w-8" />,
  gpu:         <Monitor className="h-8 w-8" />,
  storage:     <HardDrive className="h-8 w-8" />,
  psu:         <Zap className="h-8 w-8" />,
  motherboard: <Box className="h-8 w-8" />,
  keyboards:   <Keyboard className="h-8 w-8" />,
  mice:        <Mouse className="h-8 w-8" />,
  headsets:    <Headphones className="h-8 w-8" />,
};

const getIcon = (name: string) =>
  categoryIcons[name.toLowerCase()] ?? <Monitor className="h-8 w-8" />;

const Index = () => {
  const { data: categories, isLoading: catLoading } = useCategories();
  const { data: products, isLoading: prodLoading } = useProducts();

  // Show only first 4 products as "featured"
  const featured = products?.slice(0, 4) ?? [];

  return (
    <div className="min-h-screen">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden py-20 md:py-32"
        style={{ background: "var(--hero-gradient)" }}
      >
        <div className="container mx-auto px-4 text-center">
          <h1 className="font-display text-4xl font-bold text-white md:text-6xl mb-6 animate-fade-in">
            Build Your Dream PC
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-white/80 mb-8">
            Premium computer parts, expert compatibility checking, and the best prices.
            Use our PC Builder to create the perfect custom rig.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" asChild>
              <Link to="/pc-builder">
                <Cpu className="mr-2 h-5 w-5" /> Start Building
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link to="/products">
                Browse Products <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Shop by Category ──────────────────────────────────── */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="font-display text-2xl font-bold mb-8">Shop by Category</h2>
        {catLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {categories?.map((cat) => (
              <Link key={cat.id} to={`/products?categoryId=${cat.id}`}>
                <Card className="card-hover text-center p-6 hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="p-0 flex flex-col items-center gap-3">
                    <div className="text-primary">{getIcon(cat.name)}</div>
                    <span className="font-medium text-sm">{cat.name}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Featured Products ─────────────────────────────────── */}
      <section className="container mx-auto px-4 pb-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-2xl font-bold">Featured Products</h2>
          <Button variant="ghost" asChild>
            <Link to="/products">
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {prodLoading ? (
          <LoadingSpinner />
        ) : featured.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.map((p) => (
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
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>No products yet. Add some from the Admin panel!</p>
          </div>
        )}
      </section>

      {/* ── PC Builder CTA ────────────────────────────────────── */}
      <section className="bg-secondary py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-display text-3xl font-bold mb-4">Custom PC Builder</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Our intelligent builder checks compatibility between CPU, motherboard, RAM, and PSU
            to ensure your build works perfectly.
          </p>
          <Button size="lg" asChild>
            <Link to="/pc-builder">
              <Cpu className="mr-2 h-5 w-5" /> Launch PC Builder
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Index;
