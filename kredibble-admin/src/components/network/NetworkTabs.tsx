"use client";

/**
 * NetworkTabs (GOD-T109): the two halves of the Network section, as link tabs at the top of each page.
 *   Ambassadors   the registry (/network)
 *   Applications  requests from the app to become an ambassador, where staff approve or decline them (/ambassador-applications)
 * The Applications tab shows how many requests are waiting, from the same count as the sidebar pill (services/nav-counts.ts).
 * Both pages keep their own routes and access rule (the "network" screen), so links to either still work.
 */
import { useEffect, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { getNavCounts } from "@/lib/services/nav-counts";

export type NetworkTab = "ambassadors" | "applications";

const LINKS: Record<NetworkTab, string> = { ambassadors: "/network", applications: "/ambassador-applications" };

export function NetworkTabs({ value }: { value: NetworkTab }) {
  const [pending, setPending] = useState<number | undefined>(undefined);
  useEffect(() => {
    let active = true;
    getNavCounts().then((counts) => {
      if (active) setPending(counts.pendingAmbassadorRequests);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Tabs
      ariaLabel="Network"
      idPrefix="network"
      value={value}
      onChange={() => undefined}
      links={LINKS}
      tabs={[
        { value: "ambassadors", label: "Ambassadors" },
        // A count only when there is something waiting: no "0" pill.
        { value: "applications", label: "Applications", ...(pending ? { count: pending } : {}) },
      ]}
    />
  );
}
