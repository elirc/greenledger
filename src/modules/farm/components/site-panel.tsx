"use client";

import { useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import type { SiteRow } from "../queries";
import { SiteForm } from "./site-form";

/** Settings → Site: rename/edit each site; add another (model supports many). */
export function SitePanel({ sites }: { sites: SiteRow[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {sites.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No site yet"
          description="A site is the farm location your greenhouses and stores belong to."
        />
      ) : (
        sites.map((s) => (
          <SectionCard key={s.id} title={s.name}>
            <SiteForm site={s} submitLabel="Save site" />
          </SectionCard>
        ))
      )}
      {adding || sites.length === 0 ? (
        <SectionCard title="New site">
          <SiteForm submitLabel="Add site" onSaved={() => setAdding(false)} />
        </SectionCard>
      ) : (
        <Button
          variant="outline"
          className="h-11 w-full"
          onClick={() => setAdding(true)}
        >
          <Plus /> Add another site
        </Button>
      )}
    </div>
  );
}
