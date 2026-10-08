"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/permissions";
import type { StaffAccessInput } from "../schema";

export type GreenhouseOption = { id: string; name: string };

const ROLE_HINTS: Record<Role, string> = {
  owner: "Everything, including staff and billing.",
  manager: "Runs the farm: stock, logs, sales, reports and overrides.",
  storekeeper: "Receives, issues and counts stock.",
  worker: "Logs work in assigned greenhouses. Never sees prices.",
};

/**
 * Role select + (for workers) greenhouse multi-select. Must be rendered
 * inside a <Form> whose values include `role` and `greenhouseIds`.
 */
export function StaffAccessFields({
  greenhouses,
  roleLocked = false,
}: {
  greenhouses: GreenhouseOption[];
  /** Owners cannot change their own role. */
  roleLocked?: boolean;
}) {
  const form = useFormContext<StaffAccessInput>();
  const role = useWatch({ control: form.control, name: "role" });

  return (
    <>
      <FormField
        control={form.control}
        name="role"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Role</FormLabel>
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={roleLocked}
            >
              <FormControl>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="min-h-11">
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>
              {roleLocked
                ? "You can't change your own role."
                : role
                  ? ROLE_HINTS[role]
                  : null}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      {role === "worker" ? (
        <FormField
          control={form.control}
          name="greenhouseIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Assigned greenhouses</FormLabel>
              <FormDescription>
                Workers only see and log work for these greenhouses.
              </FormDescription>
              {greenhouses.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
                  No greenhouses yet. Add them under Settings → Farm structure,
                  then assign them here.
                </p>
              ) : (
                <ul className="divide-border divide-y rounded-lg border">
                  {greenhouses.map((gh) => {
                    const checked = field.value.includes(gh.id);
                    return (
                      <li key={gh.id}>
                        <label className="hover:bg-muted/50 flex min-h-12 cursor-pointer items-center gap-3 px-4">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) =>
                              field.onChange(
                                next === true
                                  ? [...field.value, gh.id]
                                  : field.value.filter((id) => id !== gh.id),
                              )
                            }
                          />
                          <span className="text-sm font-medium">{gh.name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </>
  );
}
