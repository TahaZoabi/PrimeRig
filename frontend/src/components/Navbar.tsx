/**
 * Navbar - sticky top navigation bar
 * Includes: logo, search, desktop nav links, mobile hamburger menu
 */
import { Link, useNavigate } from "react-router-dom";
import { ShoppingCart, User, Menu, X, Search, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

const Navbar = () => {
  const { user, isAdmin, signOut } = useAuth();
  const { cartCount } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/products?search=${encodeURIComponent(search.trim())}`);
      setSearch("");
      setMenuOpen(false);
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold text-primary flex-shrink-0">
          <Monitor className="h-6 w-6" />
          <span>PimeRig</span>
        </Link>

        {/* Search bar - desktop */}
        <form onSubmit={handleSearch} className="hidden flex-1 max-w-md md:flex">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </form>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" asChild>
            <Link to="/products">Products</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/pc-builder">PC Builder</Link>
          </Button>
          {isAdmin && (
            <Button variant="ghost" asChild>
              <Link to="/admin">Admin</Link>
            </Button>
          )}

          {/* Cart with badge */}
          <Button variant="ghost" asChild className="relative">
            <Link to="/cart">
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <Badge className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center bg-accent text-accent-foreground">
                  {cartCount > 99 ? "99+" : cartCount}
                </Badge>
              )}
            </Link>
          </Button>

          <ThemeToggle />

          {user ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" asChild>
                <Link to="/orders">
                  <User className="h-5 w-5" />
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign Out
              </Button>
            </div>
          ) : (
            <Button asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
          )}
        </div>

        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="border-t p-4 md:hidden animate-fade-in bg-card">
          <form onSubmit={handleSearch} className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </form>
          <div className="flex flex-col gap-2">
            <Button variant="ghost" asChild className="justify-start" onClick={() => setMenuOpen(false)}>
              <Link to="/products">Products</Link>
            </Button>
            <Button variant="ghost" asChild className="justify-start" onClick={() => setMenuOpen(false)}>
              <Link to="/pc-builder">PC Builder</Link>
            </Button>
            <Button variant="ghost" asChild className="justify-start" onClick={() => setMenuOpen(false)}>
              <Link to="/cart">
                Cart {cartCount > 0 && `(${cartCount})`}
              </Link>
            </Button>
            {isAdmin && (
              <Button variant="ghost" asChild className="justify-start" onClick={() => setMenuOpen(false)}>
                <Link to="/admin">Admin</Link>
              </Button>
            )}
            {user ? (
              <>
                <Button variant="ghost" asChild className="justify-start" onClick={() => setMenuOpen(false)}>
                  <Link to="/orders">My Orders</Link>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => { signOut(); setMenuOpen(false); }}
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <Button asChild onClick={() => setMenuOpen(false)}>
                <Link to="/auth">Sign In</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
