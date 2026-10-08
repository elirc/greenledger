"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
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
  normalizeNigerianPhone,
  signInEmailSchema,
  signInPhoneSchema,
  type SignInEmailInput,
  type SignInPhoneInput,
} from "../schema";

type AuthErrorLike = { code?: string; message?: string; status?: number } | null;

function sendOtpMessage(error: NonNullable<AuthErrorLike>): string {
  if (error.status === 429) return "Too many requests. Wait a minute and try again.";
  if (error.code === "INVALID_PHONE_NUMBER") return "That phone number isn't valid.";
  return "We couldn't send the code. Check your connection and try again.";
}

function emailSignInMessage(error: NonNullable<AuthErrorLike>): string {
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (error.status === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD") {
    return "Email or password is incorrect.";
  }
  return "We couldn't sign you in. Check your connection and try again.";
}

function DevHint() {
  return (
    <Alert>
      <Info />
      <AlertDescription>Dev build: the code is always 123456</AlertDescription>
    </Alert>
  );
}

function PhoneSignIn() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignInPhoneInput>({
    resolver: zodResolver(signInPhoneSchema),
    defaultValues: { phone: "" },
  });

  async function onSubmit(values: SignInPhoneInput) {
    setFormError(null);
    const phoneNumber = normalizeNigerianPhone(values.phone);
    if (!phoneNumber) {
      form.setError("phone", { message: "Enter a valid Nigerian mobile number" });
      return;
    }
    const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber });
    if (error) {
      setFormError(sendOtpMessage(error));
      return;
    }
    router.push(`/verify?phone=${encodeURIComponent(phoneNumber)}`);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone number</FormLabel>
              <FormControl>
                <Input
                  className="h-12 text-lg"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0803 123 4567"
                  {...field}
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
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Sending code…" : "Send code"}
        </Button>
      </form>
    </Form>
  );
}

function EmailSignIn() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignInEmailInput>({
    resolver: zodResolver(signInEmailSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInEmailInput) {
    setFormError(null);
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setFormError(emailSignInMessage(error));
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  type="password"
                  autoComplete="current-password"
                  {...field}
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
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Form>
  );
}

/** Phone-first sign-in with an email+password fallback. */
export function SignInForm({ showDevHint }: { showDevHint: boolean }) {
  const [mode, setMode] = useState<"phone" | "email">("phone");

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm">
          {mode === "phone"
            ? "We'll text you a 6-digit code."
            : "Use the email and password for your account."}
        </p>
      </div>
      {mode === "phone" && showDevHint ? <DevHint /> : null}
      {mode === "phone" ? <PhoneSignIn /> : <EmailSignIn />}
      <Button
        type="button"
        variant="ghost"
        className="h-11 w-full"
        onClick={() => setMode(mode === "phone" ? "email" : "phone")}
      >
        {mode === "phone"
          ? "Use email and password instead"
          : "Use my phone number instead"}
      </Button>
    </div>
  );
}
