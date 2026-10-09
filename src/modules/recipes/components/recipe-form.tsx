"use client";

import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action";
import { UNIT_LABELS } from "@/lib/units";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import type { RecipeItemOption } from "../queries";
import {
  DEFAULT_CATEGORIES,
  RECIPE_TYPES,
  RECIPE_TYPE_LABELS,
  recipeCreateSchema,
  type RecipeCreateInput,
  type RecipeLineInput,
} from "../schema";
import { InputCombobox } from "./input-combobox";

/** Empty line: quantity starts blank so zod reports "Enter a quantity". */
const blankLine = () =>
  ({ itemId: "", quantityPer1000l: undefined }) as unknown as RecipeLineInput;

/**
 * Recipe create/edit: name, type, description, active flag and the input
 * lines (quantity per 1,000 L of water in the item's base unit).
 */
export function RecipeForm({
  items,
  defaultValues,
  onSubmitAction,
  submitLabel,
}: {
  items: RecipeItemOption[];
  defaultValues?: Partial<RecipeCreateInput>;
  onSubmitAction: (
    input: RecipeCreateInput,
  ) => Promise<ActionResult<{ id: string }>>;
  submitLabel: string;
}) {
  const router = useRouter();
  const form = useForm<RecipeCreateInput>({
    resolver: zodResolver(recipeCreateSchema),
    defaultValues: {
      name: "",
      type: "fertigation",
      description: "",
      isActive: true,
      lines: [{ itemId: "", quantityPer1000l: undefined }],
      ...defaultValues,
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const [type, lines] = useWatch({
    control: form.control,
    name: ["type", "lines"],
  });

  async function onSubmit(values: RecipeCreateInput) {
    const result = await onSubmitAction(values);
    if (result.ok) {
      toast.success("Recipe saved");
      router.push("/recipes");
      router.refresh();
      return;
    }
    applyActionError(form, result, "name");
  }

  const linesError =
    form.formState.errors.lines?.root?.message ??
    form.formState.errors.lines?.message;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  autoComplete="off"
                  placeholder="e.g. Veg Feed"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {RECIPE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="min-h-11">
                      {RECIPE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {type === "spray"
                  ? "Sprays set entry and harvest safety windows from the chemicals' REI/PHI."
                  : "Fertigation feeds through the irrigation water."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium">Inputs per 1,000 L of water</h2>
            <p className="text-muted-foreground text-xs">
              Quantities are in each input&apos;s stock unit.
            </p>
          </div>
          <ul className="space-y-3">
            {fields.map((f, i) => {
              const item = items.find((it) => it.id === lines?.[i]?.itemId);
              return (
                <li key={f.id} className="space-y-2 rounded-lg border p-3">
                  <FormField
                    control={form.control}
                    name={`lines.${i}.itemId`}
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Input</FormLabel>
                        <FormControl>
                          <InputCombobox
                            options={items}
                            preferredCategories={DEFAULT_CATEGORIES[type]}
                            value={field.value}
                            onChange={field.onChange}
                            invalid={Boolean(fieldState.error)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`lines.${i}.quantityPer1000l`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel className="sr-only">
                            Quantity per 1,000 L
                          </FormLabel>
                          <div className="flex items-center gap-2">
                            <FormControl>
                              <NumberInput
                                decimal
                                placeholder="Qty"
                                name={field.name}
                                ref={field.ref}
                                onBlur={field.onBlur}
                                value={field.value}
                                onChange={field.onChange}
                              />
                            </FormControl>
                            <span className="text-muted-foreground w-16 shrink-0 text-sm">
                              {item ? UNIT_LABELS[item.baseUnit] : "—"} / 1,000 L
                            </span>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0"
                      aria-label="Remove input"
                      disabled={fields.length === 1}
                      onClick={() => remove(i)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {linesError ? (
            <p className="text-destructive text-sm">{linesError}</p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => append(blankLine())}
          >
            <Plus className="size-4" /> Add input
          </Button>
        </section>

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div>
                <FormLabel>Active</FormLabel>
                <FormDescription>
                  Inactive recipes are hidden from the application form.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Active"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
