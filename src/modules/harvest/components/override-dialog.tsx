"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { formatLagosDate } from "@/lib/dates";
import { harvestOverrideSchema, type HarvestOverrideInput } from "../schema";

/**
 * Manager/owner PHI override: reason (min 5 chars, same zod schema the
 * action validates) → parent resubmits the harvest with `override`.
 */
export function OverrideDialog({
  open,
  onOpenChange,
  harvestSafeDate,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  harvestSafeDate: string | null;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const form = useForm<HarvestOverrideInput>({
    resolver: zodResolver(harvestOverrideSchema),
    defaultValues: { reason: "" },
  });

  useEffect(() => {
    if (open) form.reset({ reason: "" });
  }, [open, form]);

  async function onSubmit(values: HarvestOverrideInput) {
    await onConfirm(values.reason);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="text-destructive size-5" aria-hidden />
            Override pre-harvest interval
          </DialogTitle>
          <DialogDescription>
            {harvestSafeDate
              ? `This greenhouse is not safe to harvest until ${formatLagosDate(harvestSafeDate)}.`
              : "This greenhouse is inside a pre-harvest interval."}{" "}
            The override and your reason are recorded against this harvest and in
            the audit log.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      autoFocus
                      placeholder="e.g. label PHI is 1 day, re-checked with agronomist"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                className="h-11"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Saving…" : "Override and save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
