import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VerifyForm } from "@/modules/users/components/verify-form";
import { isLocalDevUrl, normalizeNigerianPhone } from "@/modules/users/schema";

export const metadata = { title: "Verify code" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function VerifyContent({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = typeof sp.phone === "string" ? sp.phone : "";
  const phoneNumber = raw ? normalizeNigerianPhone(raw) : null;

  if (!phoneNumber) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Phone number missing
        </h1>
        <p className="text-muted-foreground text-sm">
          We don&apos;t know which number to check. Start again and we&apos;ll
          send you a new code.
        </p>
        <Button asChild className="h-12 w-full text-base">
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <VerifyForm
      phoneNumber={phoneNumber}
      showDevHint={isLocalDevUrl(process.env.NEXT_PUBLIC_APP_URL)}
    />
  );
}

function VerifySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-6 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export default function VerifyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<VerifySkeleton />}>
      <VerifyContent searchParams={searchParams} />
    </Suspense>
  );
}
