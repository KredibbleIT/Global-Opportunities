"use client";

/**
 * Reference data: the dropdown lists the mobile app uses. This one page replaces the Seeker, Hirer and
 * Grants Taxonomy pages (their old URLs redirect here: see src/config/redirects.ts).
 *
 *   [ Seekers | Hirers | Grants ]            <- SegmentedControl, kept in the URL as ?tab=hirer / ?tab=grants
 *   Universities 21 | Programs 25 | ...      <- Tabs with counts (one row per group)
 *   <ReferenceListEditor>                    <- the shared content card
 *
 * In mock mode: State stays in memory.
 * In live mode: Fetches from /admin/reference-data and persists changes via PUT /admin/reference-data/:group/:key.
 */
import { PageHeader } from "@/components/ui/PageHeader";
import { useCallback, useEffect, useState } from "react";
import { Database } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { REFERENCE_GROUPS, type ReferenceGroupKey } from "@/lib/reference-data";
import { ReferenceListEditor } from "@/components/reference/ReferenceListEditor";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tabs, tabId, tabPanelId } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { isMockMode } from "@/lib/services/mock-mode";
import { getAdminReferenceData, updateAdminReferenceList } from "@/lib/api";

const GROUP_PARAM = "tab";

export default function ReferenceDataPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const toast = useToast();
  // GOD-T42: real mode shows the server's lists, never the sample ones while they load or after a failure (it used to start
  // from the sample lists and swallow every error, so a failed load or save went unnoticed). Mock mode: the sample lists.
  const live = !isMockMode();
  const sampleItems = () => Object.fromEntries(REFERENCE_GROUPS.flatMap((group) => group.lists.map((list) => [list.key, list.items])));
  const [items, setItems] = useState<Record<string, string[]>>(() => (live ? {} : sampleItems()));
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(live ? "loading" : "ready");
  const [openList, setOpenList] = useState<Record<string, string>>(() =>
    Object.fromEntries(REFERENCE_GROUPS.map((group) => [group.key, group.lists[0].key])),
  );

  // The state changes happen when the request settles, never synchronously in the effect.
  const fetchLists = useCallback(() => {
    getAdminReferenceData()
      .then((groups) => {
        const loaded = Array.isArray(groups) ? Object.fromEntries(groups.flatMap((g) => g.lists.map((l) => [l.key, l.items]))) : {};
        setItems(loaded);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);
  useEffect(() => {
    if (live) fetchLists();
  }, [live, fetchLists]);
  const retry = () => {
    setLoadState("loading");
    fetchLists();
  };

  const requested = params.get(GROUP_PARAM);
  const group = REFERENCE_GROUPS.find((g) => g.key === requested) ?? REFERENCE_GROUPS[0];
  const list = group.lists.find((l) => l.key === openList[group.key]) ?? group.lists[0];

  const selectGroup = (key: ReferenceGroupKey) => {
    router.replace(key === REFERENCE_GROUPS[0].key ? pathname : `${pathname}?${GROUP_PARAM}=${key}`, { scroll: false });
  };

  // The change shows at once; real mode then saves it, and a failed save puts the list back and says so.
  const handleListChange = (groupKey: ReferenceGroupKey, listKey: string, next: string[]) => {
    const previous = items[listKey] || [];
    setItems((current) => ({ ...current, [listKey]: next }));
    if (!live) return;
    updateAdminReferenceList(groupKey, listKey, { items: next }).catch((error: unknown) => {
      setItems((current) => ({ ...current, [listKey]: previous }));
      toast.error(error instanceof Error ? `The list could not be saved: ${error.message}` : "The list could not be saved.");
    });
  };

  const idPrefix = `reference-${group.key}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Reference data" subtitle={group.description} />

      <SegmentedControl
        ariaLabel="Reference data group"
        value={group.key}
        onChange={selectGroup}
        options={REFERENCE_GROUPS.map((g) => ({ value: g.key, label: g.label }))}
      />

      <Tabs
        ariaLabel={`${group.label} lists`}
        idPrefix={idPrefix}
        value={list.key}
        onChange={(key) => setOpenList((current) => ({ ...current, [group.key]: key }))}
        tabs={group.lists.map((l) => ({ value: l.key, label: l.label, count: loadState === "ready" ? (items[l.key] || []).length : undefined }))}
      />

      <div role="tabpanel" id={tabPanelId(idPrefix, list.key)} aria-labelledby={tabId(idPrefix, list.key)}>
        {loadState === "loading" ? (
          <Card>
            <div data-testid="reference-loading" aria-busy="true" className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-8 w-2/3" />
            </div>
          </Card>
        ) : loadState === "error" ? (
          <Card>
            <EmptyState icon={Database} tone="danger" title="Could not load the reference lists" description="Please try again." action={<Button variant="secondary" onClick={retry}>Try again</Button>} />
          </Card>
        ) : (
          <ReferenceListEditor
            key={list.key}
            label={list.label}
            singular={list.singular}
            items={items[list.key] || []}
            onChange={(next) => handleListChange(group.key, list.key, next)}
          />
        )}
      </div>
    </div>
  );
}
