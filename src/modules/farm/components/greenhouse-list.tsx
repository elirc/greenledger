"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Tent, Trash2 } from "lucide-react";
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
import { deleteGreenhouse } from "../actions";
import type { GreenhouseRow, SiteRow } from "../queries";
import { GREENHOUSE_TYPE_LABELS } from "../schema";
import { GreenhouseForm } from "./greenhouse-form";
import { ZonesEditor } from "./zones-editor";

const numberFmt = new Intl.NumberFormat("en-NG");

/** Settings → Greenhouses: list + add/edit sheet with inline zones. */
export function GreenhouseList({
  greenhouses,
  sites,
}: {
  greenhouses: GreenhouseRow[];
  sites: Pick<SiteRow, "id" | "name">[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const editing = greenhouses.find((g) => g.id === editingId) ?? null;

  async function onDelete(g: GreenhouseRow) {
    const result = await deleteGreenhouse({ id: g.id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.outcome === "deactivated") {
      toast.info(`${g.name} was deactivated instead of deleted`, {
        description:
          "It has crop cycles or other history, so it is kept for your records.",
      });
    } else {
      toast.success(`${g.name} deleted`);
    }
    setEditingId(null);
    router.refresh();
  }

  const addButton = (
    <Button className="h-11" onClick={() => setAdding(true)}>
      <Plus /> Add greenhouse
    </Button>
  );

  return (
    <div className="space-y-4">
      {greenhouses.length === 0 ? (
        <EmptyState
          icon={Tent}
          title="No greenhouses yet"
          description="Add each greenhouse, net house or field block you grow in."
        >
          {addButton}
        </EmptyState>
      ) : (
        <>
          <div className="flex justify-end">{addButton}</div>
          <ul className="divide-border divide-y rounded-lg border">
            {greenhouses.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setEditingId(g.id)}
                  className="hover:bg-muted/50 flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{g.name}</span>
                      {!g.isActive ? (
                        <StatusBadge variant="neutral">Inactive</StatusBadge>
                      ) : null}
                    </div>
                    <span className="text-muted-foreground text-sm">
                      {GREENHOUSE_TYPE_LABELS[g.type]} ·{" "}
                      {numberFmt.format(g.areaM2)} m² ·{" "}
                      {numberFmt.format(g.plantCapacity)} plants
                      {g.zones.length > 0
                        ? ` · ${g.zones.length} zone${g.zones.length === 1 ? "" : "s"}`
                        : ""}
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
            <SheetTitle>Add greenhouse</SheetTitle>
            <SheetDescription>Zones can be added after saving.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <GreenhouseForm sites={sites} onSaved={() => setAdding(false)} />
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
                <SheetDescription>
                  Edit details, manage zones, or remove this greenhouse.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 px-4 pb-6">
                <GreenhouseForm
                  key={editing.id}
                  greenhouse={editing}
                  sites={sites}
                  onSaved={() => setEditingId(null)}
                />
                <Separator />
                <section className="space-y-3">
                  <h3 className="font-medium">Zones</h3>
                  <ZonesEditor
                    greenhouseId={editing.id}
                    zones={editing.zones}
                  />
                </section>
                <Separator />
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive" className="h-11 w-full">
                      <Trash2 /> Delete greenhouse
                    </Button>
                  }
                  title={`Delete ${editing.name}?`}
                  description="If it has crop cycles or other history it will be deactivated instead, so your records stay intact."
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
