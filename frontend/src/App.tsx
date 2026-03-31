/**
 * App.tsx - Root application component
 *
 * Sets up React Query, ThemeProvider, AuthProvider, router, and global layout.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/hooks/useTheme";
import { AuthProvider } from "@/hooks/useAuth";
import Navbar  from "@/components/Navbar";
import Footer  from "@/components/Footer";

// Pages
import Index             from "./pages/Index";
import AuthPage          from "./pages/AuthPage";
import ProductsPage      from "./pages/ProductsPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import CartPage          from "./pages/CartPage";
import CheckoutPage      from "./pages/CheckoutPage";
import OrdersPage        from "./pages/OrdersPage";
import PCBuilderPage     from "./pages/PCBuilderPage";
import AdminPage         from "./pages/AdminPage";
import NotFound          from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <Toaster position="top-right" richColors />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">
              <Routes>
                <Route path="/"             element={<Index />} />
                <Route path="/auth"         element={<AuthPage />} />
                <Route path="/products"     element={<ProductsPage />} />
                <Route path="/products/:id" element={<ProductDetailPage />} />
                <Route path="/cart"         element={<CartPage />} />
                <Route path="/checkout"     element={<CheckoutPage />} />
                <Route path="/orders"       element={<OrdersPage />} />
                <Route path="/pc-builder"   element={<PCBuilderPage />} />
                <Route path="/admin"        element={<AdminPage />} />
                <Route path="*"             element={<NotFound />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
