"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";
import { createZone, deleteZone, moveZone, renameZone } from "../actions";
import type { GreenhouseRow } from "../queries";

type Zone = GreenhouseRow["zones"][number];

/** Inline zone management for one greenhouse: add, rename, reorder, remove. */
export function ZonesEditor({
  greenhouseId,
  zones,
}: {
  greenhouseId: string;
  zones: Zone[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function run<T>(
    op: () => Promise<ActionResult<T>>,
    success?: string,
    after?: () => void,
  ) {
    startTransition(async () => {
      const result = await op();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (success) toast.success(success);
      after?.();
      router.refresh();
    });
  }

  function addZone() {
    const name = newName.trim();
    if (!name) return;
    run(() => createZone({ greenhouseId, name }), "Zone added", () =>
      setNewName(""),
    );
  }

  return (
    <div className="space-y-2">
      {zones.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No zones yet. Zones (bays, rows, sections) are optional.
        </p>
      ) : (
        <ul className="space-y-2">
          {zones.map((z, i) => {
            const draft = drafts[z.id] ?? z.name;
            const dirty = draft.trim() !== z.name && draft.trim().length > 0;
            return (
              <li key={z.id} className="flex items-center gap-1">
                <Input
                  aria-label={`Zone ${i + 1} name`}
                  className="h-11 flex-1"
                  value={draft}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [z.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && dirty) {
                      e.preventDefault();
                      run(
                        () => renameZone({ id: z.id, name: draft.trim() }),
                        "Zone renamed",
                      );
                    }
                  }}
                />
                {dirty ? (
                  <Button
                    type="button"
                    size="icon"
                    className="size-11"
                    aria-label="Save zone name"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => renameZone({ id: z.id, name: draft.trim() }),
                        "Zone renamed",
                      )
                    }
                  >
                    <Check />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label="Move zone up"
                  disabled={pending || i === 0}
                  onClick={() => run(() => moveZone({ id: z.id, direction: "up" }))}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label="Move zone down"
                  disabled={pending || i === zones.length - 1}
                  onClick={() =>
                    run(() => moveZone({ id: z.id, direction: "down" }))
                  }
                >
                  <ArrowDown />
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive size-11"
                      aria-label="Remove zone"
                      disabled={pending}
                    >
                      <Trash2 />
                    </Button>
                  }
                  title={`Remove zone "${z.name}"?`}
                  description="Crop cycles in this zone keep their history but lose the zone link."
                  confirmLabel="Remove"
                  destructive
                  onConfirm={() =>
                    run(() => deleteZone({ id: z.id }), "Zone removed")
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          aria-label="New zone name"
          placeholder="New zone, e.g. Bay A"
          className="h-11 flex-1"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addZone();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={pending || newName.trim().length === 0}
          onClick={addZone}
        >
          <Plus /> Add
        </Button>
      </div>
    </div>
  );
}
