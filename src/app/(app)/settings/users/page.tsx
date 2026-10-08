import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { formatLagosDate } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { RoleBadge } from "@/modules/users/components/role-badge";
import { listStaff } from "@/modules/users/queries";
import { formatPhoneDisplay, isTempPhoneEmail } from "@/modules/users/schema";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const ctx = await requireMember({ roles: ["owner"] });
  const staff = await listStaff(ctx);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="People who can sign in to this farm."
        backHref="/settings"
        action={
          <Button asChild className="h-11">
            <Link href="/settings/users/new">
              <Plus className="size-4" /> Add staff
            </Link>
          </Button>
        }
      />
      {staff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff yet"
          description="Add managers, storekeepers and workers by phone number. They sign in with a text code."
        >
          <Button asChild className="h-11">
            <Link href="/settings/users/new">Add your first staff member</Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {staff.map((s) => {
            const contact =
              formatPhoneDisplay(s.phoneNumber) ||
              (isTempPhoneEmail(s.email) ? "" : s.email) ||
              "No contact details";
            return (
              <li key={s.memberId}>
                <Link
                  href={`/settings/users/${s.memberId}`}
                  className="hover:bg-muted/50 flex min-h-16 flex-col justify-center gap-1 px-4 py-2"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {s.name}
                      {s.isSelf ? (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          (you)
                        </span>
                      ) : null}
                    </span>
                    <RoleBadge role={s.role} />
                    {s.phoneNumber && !s.phoneNumberVerified ? (
                      <StatusBadge variant="warning">Not signed in yet</StatusBadge>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {[
                      contact,
                      s.role === "worker"
                        ? `${s.greenhouseCount} greenhouse${s.greenhouseCount === 1 ? "" : "s"}`
                        : null,
                      `Joined ${formatLagosDate(s.joinedAt)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
