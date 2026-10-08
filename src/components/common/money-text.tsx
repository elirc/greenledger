import { cn } from "cn";
import { formatNaira } from "@/lib/money";

/**
 * Renders a kobo amount as naira. Workers receive null for money fields
 * (server-side redaction) — rendered as an em dash, never 0.
 */
export function MoneyText({
  kobo,
  className,
}: {
  kobo: number | null | undefined;
  className?: string;
}) {
  if (kobo === null || kobo === undefined) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  return (
    <span className={cn("tabular-nums", className)}>{formatNaira(kobo)}</span>
  );
}
