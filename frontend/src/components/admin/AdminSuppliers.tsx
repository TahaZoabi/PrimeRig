/**
 * components/admin/AdminSuppliers.tsx
 * CRUD panel for suppliers.
 *
 * Suppliers are never permanently deleted — "Archive" marks a supplier
 * inactive (products linked to it keep working) and "Restore" brings it
 * back. Active and Archived suppliers are shown in separate sub-tabs.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { suppliersApi } from "@/lib/api";
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

interface Supplier {
  id: string;
  name: string;
  contact_email: string | null;
  specialization: string | null;
  is_active: boolean | number;
  archived_at: string | null;
}

const AdminSuppliers = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [spec, setSpec] = useState("");

  const { data: suppliers, isLoading } = useQuery<Supplier[]>({
    queryKey: ["admin-suppliers"],
    queryFn: async () => {
      const { data } = await suppliersApi.adminList();
      return data;
    },
  });

  const activeSuppliers = suppliers?.filter((s) => s.is_active) ?? [];
  const archivedSuppliers = suppliers?.filter((s) => !s.is_active) ?? [];

  // Archiving/restoring a supplier could affect any future customer-facing
  // use of the public ["suppliers"] list, so keep both caches in sync.
  const invalidateBoth = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] });
    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        contact_email: email || null,
        specialization: spec || null,
      };
      if (editId) {
        await suppliersApi.update(editId, payload);
      } else {
        await suppliersApi.create(payload);
      }
    },
    onSuccess: () => {
      invalidateBoth();
      toast.success(editId ? "Supplier updated" : "Supplier created");
      closeDialog();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to save supplier");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      await suppliersApi.delete(id);
    },
    onSuccess: () => {
      invalidateBoth();
      toast.success("Supplier archived");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to archive supplier");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      await suppliersApi.restore(id);
    },
    onSuccess: () => {
      invalidateBoth();
      toast.success("Supplier restored");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to restore supplier");
    },
  });

  const closeDialog = () => {
    setOpen(false);
    setEditId(null);
    setName("");
    setEmail("");
    setSpec("");
  };

  const openEdit = (s: Supplier) => {
    setEditId(s.id);
    setName(s.name);
    setEmail(s.contact_email ?? "");
    setSpec(s.specialization ?? "");
    setOpen(true);
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {activeSuppliers.length} active &bull; {archivedSuppliers.length}{" "}
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
                setEmail("");
                setSpec("");
                setOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editId ? "Edit Supplier" : "New Supplier"}
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
                placeholder="Supplier Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                type="email"
                placeholder="Contact Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                placeholder="Specialization (e.g. Processors)"
                value={spec}
                onChange={(e) => setSpec(e.target.value)}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? "Saving..." : "Save Supplier"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="active">
        <TabsList className="mb-4">
          <TabsTrigger value="active">
            Active ({activeSuppliers.length})
          </TabsTrigger>
          <TabsTrigger value="archived">
            Archived ({archivedSuppliers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {activeSuppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No active suppliers
            </p>
          ) : (
            <div className="space-y-2">
              {activeSuppliers.map((s) => (
                <Card key={s.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {s.specialization}
                        {s.contact_email && ` • ${s.contact_email}`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(s)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Archive supplier"
                        onClick={() => {
                          if (
                            confirm(
                              `Archive supplier "${s.name}"? Products linked to it keep working, and it can be restored later.`,
                            )
                          ) {
                            archiveMutation.mutate(s.id);
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
          {archivedSuppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No archived suppliers
            </p>
          ) : (
            <div className="space-y-2">
              {archivedSuppliers.map((s) => (
                <Card key={s.id} className="opacity-70">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {s.specialization}
                        {s.contact_email && ` • ${s.contact_email}`}
                      </p>
                      {s.archived_at && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Archived{" "}
                          {new Date(s.archived_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Restore supplier"
                      onClick={() => restoreMutation.mutate(s.id)}
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

export default AdminSuppliers;
