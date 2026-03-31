/**
 * components/admin/AdminCategories.tsx
 * CRUD panel for product categories.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { categoriesApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
}

const AdminCategories = () => {
  const queryClient = useQueryClient();
  const [open,        setOpen]        = useState(false);
  const [editId,      setEditId]      = useState<string | null>(null);
  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl,    setImageUrl]    = useState("");

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: async () => { const { data } = await categoriesApi.list(); return data; },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name, description: description || null, image_url: imageUrl || null };
      if (editId) {
        await categoriesApi.update(editId, payload);
      } else {
        await categoriesApi.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(editId ? "Category updated" : "Category created");
      closeDialog();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to save category");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await categoriesApi.delete(id); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category deleted");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to delete — category may have products");
    },
  });

  const closeDialog = () => {
    setOpen(false); setEditId(null);
    setName(""); setDescription(""); setImageUrl("");
  };

  const openEdit = (c: Category) => {
    setEditId(c.id); setName(c.name);
    setDescription(c.description ?? ""); setImageUrl(c.image_url ?? "");
    setOpen(true);
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{categories?.length ?? 0} categories</p>

        <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditId(null); setName(""); setDescription(""); setImageUrl(""); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Add Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Category" : "New Category"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
              <Input
                placeholder="Category Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <Input
                placeholder="Image URL"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save Category"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {categories?.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-semibold">{c.name}</p>
                {c.description && (
                  <p className="text-sm text-muted-foreground">{c.description}</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm(`Delete category "${c.name}"?`)) deleteMutation.mutate(c.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminCategories;
