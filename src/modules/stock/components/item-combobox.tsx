"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { formatQty } from "@/lib/units";
import type { RefItem } from "../queries";

export interface ItemOption extends RefItem {
  /** On-hand in the selected store (null when no store is chosen). */
  onHandInStore: number | null;
  onHandTotal: number;
}

/** Searchable item picker showing on-hand per store. */
export function ItemCombobox({
  options,
  value,
  onChange,
  storeName,
  disabled,
}: {
  options: ItemOption[];
  value: string | undefined;
  onChange: (itemId: string) => void;
  storeName?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-11 w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : "Search items…"}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Type to search…" className="h-11" />
          <CommandList>
            <CommandEmpty>No matching items.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.name} ${o.id}`}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  className="min-h-11"
                >
                  <Check
                    className={cn(
                      "size-4",
                      o.id === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{o.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {o.onHandInStore !== null
                        ? `${formatQty(o.onHandInStore, o.baseUnit)} in ${storeName ?? "this store"} · `
                        : ""}
                      {formatQty(o.onHandTotal, o.baseUnit)} total
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
