/**
 * components/admin/AdminSuppliers.tsx
 * CRUD panel for suppliers.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { suppliersApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Supplier {
  id: string;
  name: string;
  contact_email: string | null;
  specialization: string | null;
}

const AdminSuppliers = () => {
  const queryClient = useQueryClient();
  const [open,   setOpen]   = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name,   setName]   = useState("");
  const [email,  setEmail]  = useState("");
  const [spec,   setSpec]   = useState("");

  const { data: suppliers, isLoading } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: async () => { const { data } = await suppliersApi.list(); return data; },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        contact_email:  email || null,
        specialization: spec  || null,
      };
      if (editId) {
        await suppliersApi.update(editId, payload);
      } else {
        await suppliersApi.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(editId ? "Supplier updated" : "Supplier created");
      closeDialog();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to save supplier");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await suppliersApi.delete(id); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier deleted");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to delete supplier");
    },
  });

  const closeDialog = () => {
    setOpen(false); setEditId(null); setName(""); setEmail(""); setSpec("");
  };

  const openEdit = (s: Supplier) => {
    setEditId(s.id); setName(s.name);
    setEmail(s.contact_email ?? ""); setSpec(s.specialization ?? "");
    setOpen(true);
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{suppliers?.length ?? 0} suppliers</p>

        <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditId(null); setName(""); setEmail(""); setSpec(""); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Supplier" : "New Supplier"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
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
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save Supplier"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {suppliers?.map((s) => (
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
                <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm(`Delete supplier "${s.name}"?`)) deleteMutation.mutate(s.id);
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

export default AdminSuppliers;
