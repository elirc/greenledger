import Link from "next/link";
import {
  ChevronRight,
  CreditCard,
  Sprout,
  Tent,
  Users,
  type LucideIcon,
} from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";

export const metadata = { title: "Settings" };

type Entry = {
  href: string | null;
  title: string;
  description: string;
  icon: LucideIcon;
  ownerOnly: boolean;
};

const ENTRIES: Entry[] = [
  {
    href: "/settings/users",
    title: "Users",
    description: "Add staff, set roles and assign greenhouses to workers.",
    icon: Users,
    ownerOnly: true,
  },
  {
    href: "/settings/farm",
    title: "Farm structure",
    description: "Sites, greenhouses, zones and stores.",
    icon: Tent,
    ownerOnly: false,
  },
  {
    href: "/settings/varieties",
    title: "Crops & varieties",
    description: "Varieties, yields, harvest windows and shelf life.",
    icon: Sprout,
    ownerOnly: false,
  },
  {
    href: null, // placeholder until billing ships
    title: "Billing",
    description: "Plan, trial and payments.",
    icon: CreditCard,
    ownerOnly: true,
  },
];

export default async function SettingsPage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const entries = ENTRIES.filter((e) => !e.ownerOnly || ctx.role === "owner");

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Settings" description={ctx.org.name} />
      <ul className="divide-border divide-y rounded-lg border">
        {entries.map((e) => {
          const body = (
            <>
              <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
                <e.icon className="text-muted-foreground size-5" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{e.title}</span>
                <span className="text-muted-foreground text-sm">
                  {e.description}
                </span>
              </div>
              {e.href ? (
                <ChevronRight className="text-muted-foreground size-5 shrink-0" />
              ) : (
                <StatusBadge>Coming soon</StatusBadge>
              )}
            </>
          );
          return (
            <li key={e.title}>
              {e.href ? (
                <Link
                  href={e.href}
                  className="hover:bg-muted/50 flex min-h-16 items-center gap-3 px-4 py-3"
                >
                  {body}
                </Link>
              ) : (
                <div
                  aria-disabled="true"
                  className="flex min-h-16 items-center gap-3 px-4 py-3 opacity-70"
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
