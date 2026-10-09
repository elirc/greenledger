"use client";

import { useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatLagosDate } from "@/lib/dates";
import type { SeedBatchOption } from "../queries";

/** Optional searchable picker over seed item batches (≥44px rows). */
export function SeedBatchCombobox({
  batches,
  value,
  onChange,
  invalid,
  id,
}: {
  batches: SeedBatchOption[];
  value: string;
  onChange: (batchId: string) => void;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = batches.find((b) => b.id === value);

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            disabled={batches.length === 0}
            className={cn(
              "h-11 min-w-0 flex-1 justify-between font-normal",
              !selected && "text-muted-foreground",
            )}
          >
            <span className="truncate">
              {selected
                ? `${selected.itemName} · ${selected.batchNumber}`
                : batches.length === 0
                  ? "No seed batches in the store"
                  : "Pick a seed batch (optional)"}
            </span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) min-w-64 p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search seed batches…" className="h-10" />
            <CommandList>
              <CommandEmpty>No matching seed batch.</CommandEmpty>
              <CommandGroup>
                {batches.map((b) => (
                  <CommandItem
                    key={b.id}
                    value={`${b.itemName} ${b.batchNumber} ${b.id}`}
                    data-checked={b.id === value}
                    className="min-h-11"
                    onSelect={() => {
                      onChange(b.id);
                      setOpen(false);
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{b.itemName}</span>
                      <span className="text-muted-foreground text-xs">
                        Batch {b.batchNumber}
                        {b.expiryDate
                          ? ` · expires ${formatLagosDate(b.expiryDate)}`
                          : ""}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected ? (
        <Button
          type="button"
          variant="ghost"
          className="size-11 shrink-0"
          aria-label="Clear seed batch"
          onClick={() => onChange("")}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
