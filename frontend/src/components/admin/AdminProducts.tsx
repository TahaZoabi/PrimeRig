/**
 * components/admin/AdminProducts.tsx
 *
 * Admin panel for managing products.
 * Features: list all (including inactive), add, edit, delete.
 * All fields including PC-builder compatibility fields are editable.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productsApi, categoriesApi, suppliersApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ProductForm {
  name: string;
  description: string;
  price: string;
  stock: string;
  image_url: string;
  category_id: string;
  supplier_id: string;
  socket_type: string;
  ddr_type: string;
  wattage: string;
  form_factor: string;
}

const emptyForm: ProductForm = {
  name: "", description: "", price: "", stock: "", image_url: "",
  category_id: "", supplier_id: "", socket_type: "", ddr_type: "",
  wattage: "", form_factor: "",
};

const AdminProducts = () => {
  const queryClient = useQueryClient();
  const [open,   setOpen]   = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form,   setForm]   = useState<ProductForm>(emptyForm);

  // ── Data fetching ──────────────────────────────────────────
  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data } = await productsApi.adminList();
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => { const { data } = await categoriesApi.list(); return data; },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => { const { data } = await suppliersApi.list(); return data; },
  });

  // ── Save (create or update) ────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name:        form.name,
        description: form.description || null,
        price:       Number(form.price),
        stock:       Number(form.stock),
        image_url:   form.image_url   || null,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        socket_type: form.socket_type || null,
        ddr_type:    form.ddr_type    || null,
        wattage:     form.wattage ? Number(form.wattage) : 0,
        form_factor: form.form_factor || null,
      };
      if (editId) {
        await productsApi.update(editId, payload);
      } else {
        await productsApi.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(editId ? "Product updated" : "Product created");
      closeDialog();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to save product");
    },
  });

  // ── Delete ─────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await productsApi.delete(id); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      toast.success("Product deleted");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to delete product");
    },
  });

  // ── Helpers ────────────────────────────────────────────────
  const closeDialog = () => {
    setOpen(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const openEdit = (p: {
    id: string; name: string; description: string | null; price: number;
    stock: number; image_url: string | null; category_id: string | null;
    supplier_id: string | null; socket_type: string | null; ddr_type: string | null;
    wattage: number | null; form_factor: string | null;
  }) => {
    setEditId(p.id);
    setForm({
      name:        p.name,
      description: p.description  ?? "",
      price:       String(p.price),
      stock:       String(p.stock),
      image_url:   p.image_url    ?? "",
      category_id: p.category_id  ?? "",
      supplier_id: p.supplier_id  ?? "",
      socket_type: p.socket_type  ?? "",
      ddr_type:    p.ddr_type     ?? "",
      wattage:     p.wattage ? String(p.wattage) : "",
      form_factor: p.form_factor  ?? "",
    });
    setOpen(true);
  };

  const set = (field: keyof ProductForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {products?.length ?? 0} products
        </p>

        <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Add Product
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Product" : "New Product"}</DialogTitle>
            </DialogHeader>

            <form
              onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
              className="space-y-3"
            >
              {/* Basic fields */}
              <Input placeholder="Product Name *" value={form.name} onChange={set("name")} required />
              <Textarea
                placeholder="Description"
                value={form.description}
                onChange={set("description")}
                className="min-h-[80px]"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" placeholder="Price ($) *" value={form.price} onChange={set("price")} required min="0" step="0.01" />
                <Input type="number" placeholder="Stock *"     value={form.stock} onChange={set("stock")} required min="0" />
              </div>
              <Input placeholder="Image URL" value={form.image_url} onChange={set("image_url")} />

              {/* Category */}
              <Select
                value={form.category_id || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, category_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Category</SelectItem>
                  {categories?.map((c: { id: string; name: string }) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Supplier */}
              <Select
                value={form.supplier_id || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Supplier</SelectItem>
                  {suppliers?.map((s: { id: string; name: string }) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* PC Builder compatibility */}
              <p className="text-xs font-semibold text-muted-foreground pt-2">
                PC Builder Compatibility Fields
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Socket (e.g. LGA1700)" value={form.socket_type} onChange={set("socket_type")} />
                <Input placeholder="DDR Type (e.g. DDR5)"  value={form.ddr_type}    onChange={set("ddr_type")} />
                <Input type="number" placeholder="Wattage (W)" value={form.wattage}     onChange={set("wattage")} min="0" />
                <Input placeholder="Form Factor (e.g. ATX)" value={form.form_factor}  onChange={set("form_factor")} />
              </div>

              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save Product"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Products list */}
      <div className="space-y-2">
        {products?.map((p: {
          id: string; name: string; price: number; stock: number;
          image_url: string | null; is_active: boolean;
          categories: { name: string } | null;
          description: string | null; category_id: string | null;
          supplier_id: string | null; socket_type: string | null;
          ddr_type: string | null; wattage: number | null; form_factor: string | null;
        }) => (
          <Card key={p.id}>
            <CardContent className="flex items-center gap-4 p-4">
              {/* Thumbnail */}
              <div className="h-14 w-14 rounded-md bg-muted overflow-hidden flex-shrink-0">
                {p.image_url && (
                  <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold line-clamp-1">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.categories?.name ?? "No category"} &bull; Stock: {p.stock}
                  {!p.is_active && (
                    <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>
                  )}
                </p>
              </div>

              <span className="font-bold text-primary flex-shrink-0">
                ${p.price.toFixed(2)}
              </span>

              <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminProducts;
