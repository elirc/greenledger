"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import type { ActionResult } from "@/lib/action";
import {
  staffAccessSchema,
  staffCreateSchema,
  type StaffAccessInput,
  type StaffCreateInput,
} from "../schema";
import { StaffAccessFields, type GreenhouseOption } from "./staff-access-fields";

function applyFieldErrors<T extends Record<string, unknown>>(
  setError: (name: keyof T & string, error: { message: string }) => void,
  fieldErrors: Record<string, string[]> | undefined,
) {
  if (!fieldErrors) return;
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages[0]) setError(field as keyof T & string, { message: messages[0] });
  }
}

/** Add staff: name, phone, role, and greenhouses when role = worker. */
export function StaffForm({
  greenhouses,
  onSubmitAction,
}: {
  greenhouses: GreenhouseOption[];
  onSubmitAction: (
    input: StaffCreateInput,
  ) => Promise<ActionResult<{ id: string }>>;
}) {
  const router = useRouter();
  const form = useForm<StaffCreateInput>({
    resolver: zodResolver(staffCreateSchema),
    defaultValues: { name: "", phone: "", role: "worker", greenhouseIds: [] },
  });

  async function onSubmit(values: StaffCreateInput) {
    const result = await onSubmitAction(values);
    if (result.ok) {
      toast.success("Staff member added. They can now sign in with their phone.");
      router.push("/settings/users");
      router.refresh();
      return;
    }
    applyFieldErrors<StaffCreateInput>(
      (name, err) => form.setError(name, err),
      result.fieldErrors,
    );
    if (result.code === "INVALID_PHONE") {
      form.setError("phone", { message: result.error });
    }
    toast.error(result.error);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
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
              <FormLabel>Phone number</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="0803 123 4567"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                They sign in with a code sent to this number.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <StaffAccessFields greenhouses={greenhouses} />
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : "Add staff member"}
        </Button>
      </form>
    </Form>
  );
}

/** Edit an existing membership: role + worker greenhouse assignments. */
export function StaffAccessForm({
  greenhouses,
  defaultValues,
  roleLocked,
  onSubmitAction,
}: {
  greenhouses: GreenhouseOption[];
  defaultValues: StaffAccessInput;
  roleLocked: boolean;
  onSubmitAction: (
    input: StaffAccessInput,
  ) => Promise<ActionResult<{ id: string }>>;
}) {
  const router = useRouter();
  const form = useForm<StaffAccessInput>({
    resolver: zodResolver(staffAccessSchema),
    defaultValues,
  });

  async function onSubmit(values: StaffAccessInput) {
    const result = await onSubmitAction(values);
    if (result.ok) {
      toast.success("Changes saved");
      router.push("/settings/users");
      router.refresh();
      return;
    }
    applyFieldErrors<StaffAccessInput>(
      (name, err) => form.setError(name, err),
      result.fieldErrors,
    );
    toast.error(result.error);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <StaffAccessFields greenhouses={greenhouses} roleLocked={roleLocked} />
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Form>
  );
}
