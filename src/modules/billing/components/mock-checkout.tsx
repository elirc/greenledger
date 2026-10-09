"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { payMockCheckout } from "../actions";
import type { MockCheckoutInput } from "../schema";

/** "Pay now" on the mock Paystack page: signs + posts the webhook events server-side. */
export function MockCheckoutButton({ checkout }: { checkout: MockCheckoutInput }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function pay() {
    setPending(true);
    try {
      const result = await payMockCheckout(checkout);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Payment successful");
      router.push(result.data.redirectTo);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button className="h-12 w-full text-base" disabled={pending} onClick={() => void pay()}>
      {pending ? "Processing payment…" : "Pay now"}
    </Button>
  );
}
