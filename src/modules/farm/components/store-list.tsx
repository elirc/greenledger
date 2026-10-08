"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Trash2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { deleteStore } from "../actions";
import type { SiteRow, StoreRow } from "../queries";
import { STORE_TYPE_LABELS } from "../schema";
import { StoreForm } from "./store-form";

/** Settings → Stores: list + add/edit sheet. */
export function StoreList({
  stores,
  sites,
}: {
  stores: StoreRow[];
  sites: Pick<SiteRow, "id" | "name">[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const editing = stores.find((s) => s.id === editingId) ?? null;

  async function onDelete(s: StoreRow) {
    const result = await deleteStore({ id: s.id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${s.name} deleted`);
    setEditingId(null);
    router.refresh();
  }

  const addButton = (
    <Button className="h-11" onClick={() => setAdding(true)}>
      <Plus /> Add store
    </Button>
  );

  return (
    <div className="space-y-4">
      {stores.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No stores yet"
          description="Stores hold your inputs and produce: input store, cold room, packhouse."
        >
          {addButton}
        </EmptyState>
      ) : (
        <>
          <div className="flex justify-end">{addButton}</div>
          <ul className="divide-border divide-y rounded-lg border">
            {stores.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setEditingId(s.id)}
                  className="hover:bg-muted/50 flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {s.isDefault ? (
                        <StatusBadge variant="success">Default</StatusBadge>
                      ) : null}
                    </div>
                    <span className="text-muted-foreground text-sm">
                      {STORE_TYPE_LABELS[s.type]}
                    </span>
                  </div>
                  <ChevronRight className="text-muted-foreground size-5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Add store</SheetTitle>
            <SheetDescription>
              Where inputs or produce are kept.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <StoreForm sites={sites} onSaved={() => setAdding(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {editing ? (
            <>
              <SheetHeader>
                <SheetTitle>{editing.name}</SheetTitle>
                <SheetDescription>Edit or remove this store.</SheetDescription>
              </SheetHeader>
              <div className="space-y-6 px-4 pb-6">
                <StoreForm
                  key={editing.id}
                  store={editing}
                  sites={sites}
                  onSaved={() => setEditingId(null)}
                />
                <Separator />
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive" className="h-11 w-full">
                      <Trash2 /> Delete store
                    </Button>
                  }
                  title={`Delete ${editing.name}?`}
                  description="Stores with stock or produce history cannot be deleted."
                  confirmLabel="Delete"
                  destructive
                  onConfirm={() => onDelete(editing)}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
