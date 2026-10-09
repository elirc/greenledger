"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote } from "lucide-react";
import { toast } from "sonner";
import { MoneyText } from "@/components/common/money-text";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayLagos } from "@/lib/dates";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { recordPayment } from "../actions";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  paymentCreateSchema,
  type PaymentCreateInput,
} from "../schema";

/** "Record payment" button + dialog on the sale detail page. */
export function RecordPaymentDialog({
  saleId,
  saleDate,
  balanceKobo,
}: {
  saleId: string;
  saleDate: string;
  balanceKobo: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<PaymentCreateInput>({
    resolver: zodResolver(paymentCreateSchema),
    defaultValues: {
      saleId,
      amount: balanceKobo ? (balanceKobo / 100).toFixed(2) : "",
      method: "cash",
      receivedDate: todayLagos(),
      notes: "",
    },
  });

  async function onSubmit(values: PaymentCreateInput) {
    const result = await recordPayment(values);
    if (result.ok) {
      toast.success("Payment recorded");
      setOpen(false);
      form.reset({
        ...values,
        amount: "",
        notes: "",
      });
      router.refresh();
      return;
    }
    if (result.code === "OVERPAY") {
      form.setError("amount", { message: result.error });
    }
    applyActionError(form, result);
  }

  return (
    <>
      <Button
        type="button"
        className="h-12 text-base"
        onClick={() => setOpen(true)}
      >
        <Banknote className="size-5" /> Record payment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Balance due: <MoneyText kobo={balanceKobo} />
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
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₦)</FormLabel>
                    <FormControl>
                      <Input
                        className="h-11"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Method</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="h-11 w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m} value={m} className="min-h-11">
                              {PAYMENT_METHOD_LABELS[m]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="receivedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input
                          className="h-11"
                          type="date"
                          min={saleDate}
                          max={todayLagos()}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note (optional)</FormLabel>
                    <FormControl>
                      <Input
                        className="h-11"
                        autoComplete="off"
                        placeholder="Transfer reference, who paid…"
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
                {form.formState.isSubmitting ? "Saving…" : "Save payment"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
