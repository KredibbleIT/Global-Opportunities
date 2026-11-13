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
 * GOD-T59: each list also shows "Suggested at registration" (the review queue) with Approve / Reject (live mode only).
 */
import { PageHeader } from "@/components/ui/PageHeader";
import { useCallback, useEffect, useState } from "react";
import { Database } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { REFERENCE_GROUPS, type ReferenceGroupKey } from "@/lib/reference-data";
import { ReferenceListEditor } from "@/components/reference/ReferenceListEditor";
import { ReferenceSuggestions, type SuggestionDecision } from "@/components/reference/ReferenceSuggestions";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tabs, tabId, tabPanelId } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { isMockMode } from "@/lib/services/mock-mode";
import { getAdminReferenceData, reviewAdminReferenceSuggestion, updateAdminReferenceList, type ReferenceSuggestionApi } from "@/lib/api";

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
  // GOD-T59: the review queue per list key, and the suggestion being decided right now.
  const [pending, setPending] = useState<Record<string, ReferenceSuggestionApi[]>>({});
  const [deciding, setDeciding] = useState<string | null>(null);
  const [openList, setOpenList] = useState<Record<string, string>>(() =>
    Object.fromEntries(REFERENCE_GROUPS.map((group) => [group.key, group.lists[0].key])),
  );

  // The state changes happen when the request settles, never synchronously in the effect.
  const fetchLists = useCallback(() => {
    getAdminReferenceData()
      .then((groups) => {
        const lists = Array.isArray(groups) ? groups.flatMap((g) => g.lists) : [];
        setItems(Object.fromEntries(lists.map((l) => [l.key, l.items])));
        setPending(Object.fromEntries(lists.map((l) => [l.key, l.pending ?? []])));
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

  // Approve adds the entry to the list for everyone, Reject drops it; either way it leaves the queue. A failure says so.
  const decideSuggestion = (groupKey: ReferenceGroupKey, listKey: string, label: string, decision: SuggestionDecision) => {
    setDeciding(label);
    reviewAdminReferenceSuggestion(groupKey, listKey, label, decision)
      .then((result) => {
        setItems((current) => ({ ...current, [listKey]: result.items }));
        setPending((current) => ({ ...current, [listKey]: (current[listKey] ?? []).filter((s) => s.label !== label) }));
        toast.success(decision === "approve" ? `"${label}" added to the list.` : `"${label}" rejected.`);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? `The suggestion could not be saved: ${error.message}` : "The suggestion could not be saved.");
      })
      .finally(() => setDeciding(null));
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
        tabs={group.lists.map((l) => ({
          value: l.key,
          // GOD-T59: a list with suggestions waiting says so on its tab.
          label: (pending[l.key]?.length ?? 0) > 0 ? `${l.label} (${pending[l.key].length} new)` : l.label,
          count: loadState === "ready" ? (items[l.key] || []).length : undefined,
        }))}
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
          <div className="space-y-4">
          <ReferenceSuggestions
            label={list.label}
            suggestions={pending[list.key] ?? []}
            busyLabel={deciding}
            onDecide={(label, decision) => decideSuggestion(group.key, list.key, label, decision)}
          />
          <ReferenceListEditor
            key={list.key}
            label={list.label}
            singular={list.singular}
            items={items[list.key] || []}
            onChange={(next) => handleListChange(group.key, list.key, next)}
          />
          </div>
        )}
      </div>
    </div>
  );
}
