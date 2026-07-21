/**
 * components/admin/AdminCategories.tsx
 * CRUD panel for product categories.
 *
 * Categories are never permanently deleted — "Archive" marks a category
 * inactive (it disappears from customer browsing but stays linked to its
 * existing products/orders) and "Restore" brings it back. Active and
 * Archived categories are shown in separate sub-tabs.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { categoriesApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean | number;
  archived_at: string | null;
}

const AdminCategories = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data } = await categoriesApi.adminList();
      return data;
    },
  });

  const activeCategories = categories?.filter((c) => c.is_active) ?? [];
  const archivedCategories = categories?.filter((c) => !c.is_active) ?? [];

  // Archiving/restoring changes what customers see, so the public
  // ["categories"] cache (used by product filters, PC Builder, etc.) needs
  // to refresh alongside this admin list.
  const invalidateBoth = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        description: description || null,
        image_url: imageUrl || null,
      };
      if (editId) {
        await categoriesApi.update(editId, payload);
      } else {
        await categoriesApi.create(payload);
      }
    },
    onSuccess: () => {
      invalidateBoth();
      toast.success(editId ? "Category updated" : "Category created");
      closeDialog();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to save category");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      await categoriesApi.delete(id);
    },
    onSuccess: () => {
      invalidateBoth();
      toast.success("Category archived — it no longer appears to customers");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to archive category");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      await categoriesApi.restore(id);
    },
    onSuccess: () => {
      invalidateBoth();
      toast.success("Category restored — it's visible to customers again");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to restore category");
    },
  });

  const closeDialog = () => {
    setOpen(false);
    setEditId(null);
    setName("");
    setDescription("");
    setImageUrl("");
  };

  const openEdit = (c: Category) => {
    setEditId(c.id);
    setName(c.name);
    setDescription(c.description ?? "");
    setImageUrl(c.image_url ?? "");
    setOpen(true);
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {activeCategories.length} active &bull; {archivedCategories.length}{" "}
          archived
        </p>

        <Dialog
          open={open}
          onOpenChange={(o) => {
            if (!o) closeDialog();
            else setOpen(true);
          }}
        >
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setEditId(null);
                setName("");
                setDescription("");
                setImageUrl("");
                setOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editId ? "Edit Category" : "New Category"}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate();
              }}
              className="space-y-3"
            >
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
              <Button
                type="submit"
                className="w-full"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? "Saving..." : "Save Category"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="active">
        <TabsList className="mb-4">
          <TabsTrigger value="active">
            Active ({activeCategories.length})
          </TabsTrigger>
          <TabsTrigger value="archived">
            Archived ({archivedCategories.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {activeCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No active categories
            </p>
          ) : (
            <div className="space-y-2">
              {activeCategories.map((c) => (
                <Card key={c.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      {c.description && (
                        <p className="text-sm text-muted-foreground">
                          {c.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Archive category"
                        onClick={() => {
                          if (
                            confirm(
                              `Archive category "${c.name}"? It will no longer be visible to customers, but existing products and orders are unaffected.`,
                            )
                          ) {
                            archiveMutation.mutate(c.id);
                          }
                        }}
                      >
                        <Archive className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="archived">
          {archivedCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No archived categories
            </p>
          ) : (
            <div className="space-y-2">
              {archivedCategories.map((c) => (
                <Card key={c.id} className="opacity-70">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      {c.description && (
                        <p className="text-sm text-muted-foreground">
                          {c.description}
                        </p>
                      )}
                      {c.archived_at && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Archived{" "}
                          {new Date(c.archived_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Restore category"
                      onClick={() => restoreMutation.mutate(c.id)}
                    >
                      <RotateCcw className="h-4 w-4 text-green-600" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminCategories;
