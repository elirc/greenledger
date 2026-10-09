"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  CircleCheckBig,
  Leaf,
  Pencil,
  Sprout,
  Trash2,
  Warehouse,
} from "lucide-react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  deletePlannedCycle,
  transitionCycle,
} from "../actions";
import type { CycleSimpleTarget } from "../schema";
import { canTransition, type CycleStatus } from "../status";
import { StartGrowingForm } from "./start-growing-form";
import { TransplantDateForm } from "./transplant-date-form";

/**
 * Header buttons for the transitions the status machine allows from the
 * current status (canTransition — the server re-checks with
 * assertTransition). Owner/manager only; rendered only when canManage.
 */
export function CycleStatusActions({
  cycle,
  today,
}: {
  cycle: {
    id: string;
    code: string;
    status: CycleStatus;
    transplantDate: string | null;
  };
  today: string;
}) {
  const router = useRouter();
  const [growOpen, setGrowOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  async function move(to: CycleSimpleTarget, success: string) {
    const result = await transitionCycle({ id: cycle.id, to });
    if (result.ok) {
      toast.success(success);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function remove() {
    const result = await deletePlannedCycle({ id: cycle.id });
    if (result.ok) {
      toast.success("Planned cycle deleted");
      router.push("/cycles");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const s = cycle.status;
  const canEditDate =
    (s === "growing" || s === "harvesting") && cycle.transplantDate !== null;

  if (s === "closed") return null;

  return (
    <div className="flex flex-wrap gap-2">
      {canTransition(s, "growing") ? (
        <Dialog open={growOpen} onOpenChange={setGrowOpen}>
          <DialogTrigger asChild>
            <Button className="h-11">
              <Leaf className="size-4" /> Mark as growing
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark {cycle.code} as growing</DialogTitle>
              <DialogDescription>
                For direct-seeded crops or seedlings raised outside the app.
                Nursery batches are transplanted from the nursery screen.
              </DialogDescription>
            </DialogHeader>
            <StartGrowingForm
              cycleId={cycle.id}
              today={today}
              onDone={() => setGrowOpen(false)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {canTransition(s, "nursery") ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline" className="h-11">
              <Sprout className="size-4" /> In nursery
            </Button>
          }
          title="Seedlings are in the nursery?"
          description="Marks this cycle as being raised in the nursery."
          confirmLabel="Mark in nursery"
          onConfirm={() => move("nursery", "Cycle marked in nursery")}
        />
      ) : null}

      {canTransition(s, "harvesting") ? (
        <ConfirmDialog
          trigger={
            <Button className="h-11">
              <Warehouse className="size-4" /> Start harvesting
            </Button>
          }
          title="Start harvesting?"
          description={`${cycle.code} will show as harvesting on greenhouse cards and harvest entry.`}
          confirmLabel="Start harvesting"
          onConfirm={() => move("harvesting", "Cycle is now harvesting")}
        />
      ) : null}

      {canEditDate && cycle.transplantDate ? (
        <Dialog open={dateOpen} onOpenChange={setDateOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="h-11">
              <CalendarClock className="size-4" /> Edit transplant date
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit transplant date</DialogTitle>
              <DialogDescription>
                Expected first harvest and end dates follow this date.
              </DialogDescription>
            </DialogHeader>
            <TransplantDateForm
              cycleId={cycle.id}
              transplantDate={cycle.transplantDate}
              today={today}
              onDone={() => setDateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {s === "planned" ? (
        <>
          <Button asChild variant="outline" className="h-11">
            <Link href={`/cycles/${cycle.id}/edit`}>
              <Pencil className="size-4" /> Edit plan
            </Link>
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="destructive" className="h-11">
                <Trash2 className="size-4" /> Delete
              </Button>
            }
            title={`Delete ${cycle.code}?`}
            description="The planned cycle is removed. This cannot be undone."
            confirmLabel="Delete"
            destructive
            onConfirm={remove}
          />
        </>
      ) : null}

      {canTransition(s, "closed") ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline" className="h-11">
              <CircleCheckBig className="size-4" /> Close cycle
            </Button>
          }
          title={`Close ${cycle.code}?`}
          description="Closed cycles stop appearing in daily forms and forecasts. This cannot be reopened."
          confirmLabel="Close cycle"
          destructive
          onConfirm={() => move("closed", "Cycle closed")}
        />
      ) : null}
    </div>
  );
}
