"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import {
  formatPhoneDisplay,
  verifyOtpSchema,
  type VerifyOtpInput,
} from "../schema";

const RESEND_SECONDS = 60;

type AuthErrorLike = { code?: string; message?: string; status?: number };

function verifyMessage(error: AuthErrorLike): string {
  switch (error.code) {
    case "INVALID_OTP":
      return "That code is not right. Check the SMS and try again.";
    case "OTP_EXPIRED":
      return "This code has expired. Tap “Resend code” for a new one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many wrong tries. Tap “Resend code” to get a new code.";
    case "OTP_NOT_FOUND":
      return "There's no active code for this number. Tap “Resend code”.";
  }
  if (error.status === 429) return "Too many requests. Wait a minute and try again.";
  return "We couldn't check the code. Check your connection and try again.";
}

/** 6-digit OTP entry with a 60-second resend countdown. */
export function VerifyForm({
  phoneNumber,
  showDevHint,
}: {
  phoneNumber: string;
  showDevHint: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const form = useForm<VerifyOtpInput>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: { code: "" },
  });

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  async function onSubmit(values: VerifyOtpInput) {
    setFormError(null);
    const { error } = await authClient.phoneNumber.verify({
      phoneNumber,
      code: values.code,
    });
    if (error) {
      setFormError(verifyMessage(error));
      form.setValue("code", "");
      form.setFocus("code");
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function resend() {
    setResending(true);
    setFormError(null);
    try {
      const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber });
      if (error) {
        setFormError(
          error.status === 429
            ? "Too many requests. Wait a minute and try again."
            : "We couldn't send a new code. Try again.",
        );
        return;
      }
      toast.success("New code sent");
      form.setValue("code", "");
      setSecondsLeft(RESEND_SECONDS);
    } finally {
      setResending(false);
    }
  }

  const submitting = form.formState.isSubmitting;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Enter your code</h1>
        <p className="text-muted-foreground text-sm">
          We sent a 6-digit code to{" "}
          <span className="text-foreground font-medium">
            {formatPhoneDisplay(phoneNumber)}
          </span>
          .
        </p>
      </div>
      {showDevHint ? (
        <Alert>
          <Info />
          <AlertDescription>Dev build: the code is always 123456</AlertDescription>
        </Alert>
      ) : null}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Verification code</FormLabel>
                <FormControl>
                  <Input
                    className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    placeholder="000000"
                    {...field}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                      field.onChange(digits);
                      if (digits.length === 6 && !submitting) {
                        void form.handleSubmit(onSubmit)();
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {formError ? (
            <p role="alert" className="text-destructive text-sm">
              {formError}
            </p>
          ) : null}
          <Button
            type="submit"
            className="h-12 w-full text-base"
            disabled={submitting}
          >
            {submitting ? "Checking…" : "Verify and sign in"}
          </Button>
        </form>
      </Form>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          disabled={secondsLeft > 0 || resending}
          onClick={resend}
        >
          {resending
            ? "Sending…"
            : secondsLeft > 0
              ? `Resend code in ${secondsLeft}s`
              : "Resend code"}
        </Button>
        <Button asChild variant="ghost" className="h-11 w-full">
          <Link href="/sign-in">Use a different number</Link>
        </Button>
      </div>
    </div>
  );
}
