import type { ReactNode } from "react";
import { cn } from "cn";

export type StatusVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

const variantClasses: Record<StatusVariant, string> = {
  success: "bg-status-success/12 text-status-success border-status-success/25",
  warning: "bg-status-warning/15 text-status-warning border-status-warning/30",
  danger: "bg-status-danger/12 text-status-danger border-status-danger/25",
  info: "bg-status-info/12 text-status-info border-status-info/25",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({
  variant = "neutral",
  className,
  children,
}: {
  variant?: StatusVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
