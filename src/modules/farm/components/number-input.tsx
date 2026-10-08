"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";

/**
 * Numeric input for react-hook-form fields whose zod type is z.number():
 * empty text maps to undefined (zod then reports "required").
 */
export function NumberInput({
  value,
  onChange,
  decimal = false,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  decimal?: boolean;
}) {
  return (
    <Input
      type="number"
      inputMode={decimal ? "decimal" : "numeric"}
      step={decimal ? "any" : 1}
      className="h-11"
      {...props}
      value={value === undefined || Number.isNaN(value) ? "" : value}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? undefined : Number(raw));
      }}
    />
  );
}
