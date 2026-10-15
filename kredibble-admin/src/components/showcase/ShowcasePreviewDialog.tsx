"use client";

/**
 * ShowcasePreviewDialog: "Preview on the app". Shows what the app's Meet our people page will show right now: only visible categories
 * and visible entries, in their order, grouped under the category name. Photos are round for people and square for organisations;
 * an entry without a photo shows its initials. Nothing here can be edited; it reads the same rules as the app (appView in lib/showcase).
 *
 * Props: categories, entries, onClose.
 */
import { Smartphone } from "lucide-react";
import type { ShowcaseCategory, ShowcaseEntry } from "@/lib/mock-entities";
import { appView } from "@/lib/showcase";
import { Avatar } from "@/components/ui/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";

export function ShowcasePreviewDialog({ categories, entries, onClose }: { categories: readonly ShowcaseCategory[]; entries: readonly ShowcaseEntry[]; onClose: () => void }) {
  const groups = appView(categories, entries);
  return (
    <Dialog title="Preview on the app" description="What the Meet our people page shows right now: visible entries only." onClose={onClose} size="md" testId="showcase-preview">
      {groups.length === 0 ? (
        <EmptyState icon={Smartphone} title="Nothing is visible yet" description="Add an entry and keep Show on the app on, and it appears here." />
      ) : (
        <div className="space-y-6">
          {groups.map(({ category, entries: rows }) => (
            <section key={category.id} aria-label={category.name} data-testid="preview-group">
              <h3 className="card-title mb-3">{category.name}</h3>
              <ul className="space-y-3">
                {rows.map((entry) => (
                  <li key={entry.id} className="flex gap-3 rounded-card border border-line p-3" data-testid="preview-entry">
                    {entry.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.photoUrl}
                        alt=""
                        className={category.kind === "person" ? "size-14 shrink-0 rounded-full object-cover" : "size-14 shrink-0 rounded-control object-cover"}
                      />
                    ) : (
                      <Avatar name={entry.name} size="lg" />
                    )}
                    <div className="min-w-0">
                      <p className="body-sm font-semibold text-ink">{entry.name}</p>
                      <p className="caption">{[entry.title, entry.country].filter(Boolean).join(" · ")}</p>
                      {entry.bio && <p className="caption mt-1 line-clamp-3 text-ink">{entry.bio}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}
