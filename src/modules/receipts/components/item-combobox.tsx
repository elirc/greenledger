"use client";

import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
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
import { UNIT_LABELS } from "@/lib/units";
import type { ItemOption } from "@/modules/items/queries";
import { ITEM_CATEGORY_LABELS } from "@/modules/items/schema";

/** Searchable item picker (≥44px rows) for receive lines. */
export function ItemCombobox({
  items,
  value,
  onChange,
  invalid,
  id,
}: {
  items: ItemOption[];
  value: string;
  onChange: (itemId: string) => void;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-11 w-full justify-between font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          <span className="truncate">
            {selected
              ? `${selected.name} (${UNIT_LABELS[selected.baseUnit]})`
              : "Pick an item"}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search items…" className="h-10" />
          <CommandList>
            <CommandEmpty>No matching item.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.id}`}
                  keywords={[ITEM_CATEGORY_LABELS[item.category]]}
                  data-checked={item.id === value}
                  className="min-h-11"
                  onSelect={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{item.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {ITEM_CATEGORY_LABELS[item.category]} ·{" "}
                      {UNIT_LABELS[item.baseUnit]}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
