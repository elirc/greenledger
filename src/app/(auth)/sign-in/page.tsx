import { SignInForm } from "@/modules/users/components/sign-in-form";
import { isLocalDevUrl } from "@/modules/users/schema";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <SignInForm showDevHint={isLocalDevUrl(process.env.NEXT_PUBLIC_APP_URL)} />
  );
}
