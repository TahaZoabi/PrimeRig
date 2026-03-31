import { Link } from "react-router-dom";
import { Monitor } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const Footer = () => {
  const { user } = useAuth();
  return (
    <footer className="border-t bg-card mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold text-primary mb-3">
              <Monitor className="h-5 w-5" /> PimeRig
            </Link>
            <p className="text-sm text-muted-foreground">Your one-stop shop for PC parts and custom builds.</p>
          </div>
          <div>
            <h4 className="font-display font-semibold mb-3">Shop</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link to="/products" className="hover:text-foreground transition-colors">All Products</Link>
              <Link to="/pc-builder" className="hover:text-foreground transition-colors">PC Builder</Link>
            </div>
          </div>
          <div>
            <h4 className="font-display font-semibold mb-3">Account</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              {user ? (
                <>
                  <Link to="/orders" className="hover:text-foreground transition-colors">My Orders</Link>
                  <Link to="/cart" className="hover:text-foreground transition-colors">Cart</Link>
                </>
              ) : (
                <>
                  <Link to="/auth" className="hover:text-foreground transition-colors">Sign In</Link>
                  <Link to="/cart" className="hover:text-foreground transition-colors">Cart</Link>
                </>
              )}
            </div>
          </div>
          <div>
            <h4 className="font-display font-semibold mb-3">Support</h4>
            <p className="text-sm text-muted-foreground">24/7 customer support</p>
            <p className="text-sm text-muted-foreground">support@pimerig.com</p>
          </div>
        </div>
        <div className="mt-8 border-t pt-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} PimeRig. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
