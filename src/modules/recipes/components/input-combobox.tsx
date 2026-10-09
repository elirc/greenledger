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
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UNIT_LABELS, type BaseUnit } from "@/lib/units";
import {
  ITEM_CATEGORY_LABELS,
  type ItemCategory,
} from "@/modules/items/schema";

export interface InputOption {
  id: string;
  name: string;
  category: ItemCategory;
  baseUnit: BaseUnit;
}

/**
 * Searchable input (item) picker for recipe / application lines. Items in
 * `preferredCategories` are listed by default; "Show all categories" reveals
 * the rest (any category is allowed, the type only filters by default).
 */
export function InputCombobox({
  options,
  preferredCategories,
  value,
  onChange,
  invalid,
  id,
}: {
  options: InputOption[];
  preferredCategories: readonly ItemCategory[];
  value: string;
  onChange: (itemId: string) => void;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const selected = options.find((o) => o.id === value);

  const preferred = options.filter((o) =>
    preferredCategories.includes(o.category),
  );
  const others = options.filter(
    (o) => !preferredCategories.includes(o.category),
  );
  const visibleOthers = showAll || preferred.length === 0 ? others : [];

  function renderItem(o: InputOption) {
    return (
      <CommandItem
        key={o.id}
        value={`${o.name} ${o.id}`}
        keywords={[ITEM_CATEGORY_LABELS[o.category]]}
        className="min-h-11"
        onSelect={() => {
          onChange(o.id);
          setOpen(false);
        }}
      >
        <Check
          className={cn("size-4", o.id === value ? "opacity-100" : "opacity-0")}
        />
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{o.name}</span>
          <span className="text-muted-foreground text-xs">
            {ITEM_CATEGORY_LABELS[o.category]} · {UNIT_LABELS[o.baseUnit]}
          </span>
        </span>
      </CommandItem>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setShowAll(false);
      }}
    >
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
              : "Pick an input"}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search inputs…" className="h-11" />
          <CommandList>
            <CommandEmpty>No matching input.</CommandEmpty>
            {preferred.length > 0 ? (
              <CommandGroup heading="Suggested">
                {preferred.map(renderItem)}
              </CommandGroup>
            ) : null}
            {visibleOthers.length > 0 ? (
              <>
                {preferred.length > 0 ? <CommandSeparator /> : null}
                <CommandGroup heading="Other categories">
                  {visibleOthers.map(renderItem)}
                </CommandGroup>
              </>
            ) : null}
            {others.length > 0 && visibleOthers.length === 0 ? (
              <CommandGroup forceMount>
                <CommandItem
                  value="__show_all_categories"
                  forceMount
                  className="text-primary min-h-11 justify-center"
                  onSelect={() => setShowAll(true)}
                >
                  Show all categories ({others.length} more)
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
