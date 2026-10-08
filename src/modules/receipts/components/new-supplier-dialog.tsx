"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { createSupplier } from "@/modules/suppliers/actions";
import {
  supplierCreateSchema,
  type SupplierCreateInput,
} from "@/modules/suppliers/schema";

/**
 * Inline "new supplier" from the receive form, via the suppliers module's
 * own action + schema. Rendered OUTSIDE the receive <form> so its submit
 * never bubbles (React portals propagate events) into the parent form.
 */
export function NewSupplierDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (supplier: { id: string; name: string }) => void;
}) {
  const form = useForm<SupplierCreateInput>({
    resolver: zodResolver(supplierCreateSchema),
    defaultValues: { name: "", phone: "", email: "", notes: "" },
  });

  async function onSubmit(values: SupplierCreateInput) {
    const result = await createSupplier(values);
    if (result.ok) {
      toast.success("Supplier added");
      onCreated({ id: result.data.id, name: values.name.trim() });
      form.reset();
      onOpenChange(false);
      return;
    }
    applyActionError(form, result, "name");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New supplier</DialogTitle>
          <DialogDescription>
            Add the supplier now; you can fill in more details later.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.stopPropagation();
              void form.handleSubmit(onSubmit)(e);
            }}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input className="h-11" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (optional)</FormLabel>
                  <FormControl>
                    <Input
                      className="h-11"
                      type="tel"
                      inputMode="tel"
                      placeholder="0803 123 4567"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving…" : "Add supplier"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
