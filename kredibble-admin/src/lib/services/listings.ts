/**
 * Listings service: the curated (staff-made) listings of the Opportunities Queue.
 *
 * One function per need; pages never touch the store or the seed directly. Everything lives in the shared
 * in-memory mock store (mock-store.ts), so the list, the detail page, the form, the KPIs and the Overview see the
 * same listings.
 *
 * In real mode (GOD-T31) the listings are the API's: a curated listing is an Opportunity a staff member created and no hirer owns
 * (isCuratedRecord). Writes wait for /admin/opportunities and resolve with what the server saved (a failure rejects; nothing changes);
 * the shared store only caches what the API returned, for the pages that read it. Mock mode: the shared store only.
 *
 * Rules kept here, not in the pages:
 * - Publishing needs a vetted listing; it sets status "published" and the published date.
 * - A published listing is always vetted (unvetting it, or unpublishing it, is handled by the callers).
 * - Vetting sets "vetted by" and "vetted on" together.
 */
import { getMockCollection, setMockCollection, subscribeMockStore } from "@/lib/mock-store";
import type { Listing, ListingFormat, ListingMetrics, ListingType } from "@/lib/mock-entities";
import type { StaffMember } from "@/lib/mock-entities";
import { isMockMode } from "./mock-mode";
import {
  createOpportunityApi,
  getOpportunityById,
  getOpportunityMetricsApi,
  unpublishOpportunityApi,
  updateOpportunityApi,
  type OpportunityRecord,
} from "@/lib/api";

const MOCK_DELAY_MS = 300;
const afterDelay = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), MOCK_DELAY_MS));

/** Re-run a loader whenever listings (or anything else in the store) change. */
export const subscribeListings = subscribeMockStore;

/** Today as "YYYY-MM-DD" (local calendar day). */
export const todayIsoDate = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/** Convert backend OpportunityRecord to frontend Listing. */
export function toListing(record: OpportunityRecord): Listing {
  return {
    id: record.id,
    title: record.title,
    organisation: record.organisation || record.company || record.offeringOrganization || "",
    type: (record.type as ListingType) || "job",
    country: record.country || "",
    status: (record.status === "published" || record.moderationStatus === "published") ? "published" : "draft",
    vetted: Boolean(record.vetted),
    createdAt: record.createdAt ? record.createdAt.slice(0, 10) : todayIsoDate(),
    publishedAt: record.publishedAt ? record.publishedAt.slice(0, 10) : undefined,
    closesAt: record.closesAt || (record.deadline ? record.deadline.slice(0, 10) : ""),
    description: record.description || "",
    applyUrl: record.applyUrl || record.applicationUrl || record.applicationLink || "",
    costLabel: record.costLabel,
    format: (record.format as ListingFormat) || "online",
    location: record.location,
    eventAt: record.eventAt || record.eventDateTime,
    durationLabel: record.durationLabel,
    logoUrl: record.logoUrl || record.organizationLogo,
    imageUrl: record.imageUrl || record.coverImage,
    writerId: record.writerId || record.assignedWriterId,
    referralOnApply: Boolean(record.referralOnApply || record.referralCodeOnApply),
    vettedById: record.vettedById || (record.vettedBy ? String(record.vettedBy) : undefined),
    vettedOn: record.vettedOn || (record.vettedAt ? record.vettedAt.slice(0, 10) : undefined),
  };
}

/** The fields a person fills in on the form. The rest (id, dates, status) is decided by the service. */
export type ListingFields = Omit<Listing, "id" | "createdAt" | "publishedAt" | "status">;

/** One listing, or undefined when the id is not a curated listing (it may be a hirer-submitted posting). */
export async function loadListing(id: string): Promise<Listing | undefined> {
  if (!isMockMode()) {
    try {
      const res = await getOpportunityById(id);
      // only a curated listing (a hirer's posting has its own review page)
      if (res?.id && isCuratedRecord(res)) {
        const item = toListing(res);
        cacheListing(item);
        return item;
      }
    } catch {
      // Fall through to mock store
    }
  }
  return afterDelay(getMockCollection("listings").find((listing) => listing.id === id));
}

/** The reach of one listing: views and applications, website versus app. Undefined when nothing was recorded. */
export async function loadListingMetrics(id: string): Promise<ListingMetrics | undefined> {
  if (!isMockMode()) {
    try {
      const res = await getOpportunityMetricsApi(id);
      if (res?.listingId) {
        const metrics: ListingMetrics = {
          listingId: id,
          views: res.views || { website: 0, app: 0 },
          applications: res.applications || { website: 0, app: 0 },
        };
        const existing = getMockCollection("listingMetrics");
        setMockCollection("listingMetrics", [metrics, ...existing.filter((m) => m.listingId !== id)], { always: true });
        return metrics;
      }
    } catch {
      // Fall through to mock store
    }
  }
  return Promise.resolve(getMockCollection("listingMetrics").find((metrics) => metrics.listingId === id));
}

/** Everyone who can be named as vetter or writer: active team members. */
export function listingStaff(): StaffMember[] {
  return getMockCollection("staff").filter((person) => person.status === "active");
}

/** The staff member who is signed in (the vetting default), or undefined when none is marked. */
export function currentStaffMember(): StaffMember | undefined {
  return getMockCollection("staff").find((person) => person.isCurrentUser);
}

export const staffName = (id: string | undefined): string | undefined =>
  id ? getMockCollection("staff").find((person) => person.id === id)?.name : undefined;

const write = (listings: Listing[]) => setMockCollection("listings", listings, { always: true });

/** GOD-T31: a staff-curated listing on the API is one a staff member created that no hirer owns (hirer postings set hirerId). */
export const isCuratedRecord = (record: Pick<OpportunityRecord, "createdBy" | "hirerId">): boolean => Boolean(record.createdBy) && !record.hirerId;

/**
 * Keeps the listings the API returned in this browser's store, so the detail page, the form and the queue show them at once.
 * Only a real change is written: every write notifies the store's subscribers, and the pages that subscribe reload, so writing the
 * same rows again would make them load forever (Insights and the listing page did, right after GOD-T31).
 */
export function cacheListings(listings: Listing[]): void {
  if (JSON.stringify(getMockCollection("listings")) === JSON.stringify(listings)) return;
  write(listings);
}

/** cacheListings for one listing: it replaces the cached copy of the same id (first in the list). */
export function cacheListing(listing: Listing): void {
  cacheListings([listing, ...getMockCollection("listings").filter((existing) => existing.id !== listing.id)]);
}

/** A database id. The form's vetter and writer come from the staff list, which can still be sample people (ids like "staff-1"). */
const isObjectId = (value: string | undefined): value is string => !!value && /^[0-9a-f]{24}$/i.test(value);

/** The body the API takes for a listing's fields. A vetter or writer that is not a real account is left out (the API refuses it). */
const apiBody = (fields: ListingFields, status: Listing["status"], publish: boolean) => ({
  title: fields.title,
  type: fields.type,
  company: fields.organisation,
  organisation: fields.organisation,
  location: fields.location || "Online",
  country: fields.country,
  description: fields.description,
  status,
  publish,
  vetted: fields.vetted,
  vettedById: isObjectId(fields.vettedById) ? fields.vettedById : undefined,
  vettedOn: fields.vettedOn,
  closesAt: fields.closesAt,
  applyUrl: fields.applyUrl,
  costLabel: fields.costLabel,
  durationLabel: fields.durationLabel,
  format: fields.format,
  eventAt: fields.eventAt,
  logoUrl: fields.logoUrl,
  imageUrl: fields.imageUrl,
  writerId: isObjectId(fields.writerId) ? fields.writerId : undefined,
  referralOnApply: fields.referralOnApply,
});

/**
 * Creates a listing as a draft, or published when `publish` is true (the form only allows that when vetted).
 * Real mode (GOD-T31): waits for POST /admin/opportunities and resolves with the listing as the server saved it (its real id), so it
 * survives a reload; a failure rejects and nothing is added. Mock mode: the shared store only.
 */
export async function createListing(fields: ListingFields, publish: boolean): Promise<Listing> {
  if (!isMockMode()) {
    const saved = toListing(await createOpportunityApi(apiBody(fields, publish ? "published" : "draft", publish)));
    cacheListing(saved);
    if (saved.status === "published") startMetrics(saved.id);
    return saved;
  }
  const today = todayIsoDate();
  const listing: Listing = {
    ...fields,
    id: `lst-new-${Date.now()}`,
    status: publish ? "published" : "draft",
    createdAt: today,
    publishedAt: publish ? today : undefined,
  };
  write([listing, ...getMockCollection("listings")]);
  if (publish) startMetrics(listing.id);
  return listing;
}

/**
 * Saves the form over an existing listing. `publish` moves a draft to published (and sets the published date).
 * Real mode: waits for PATCH /admin/opportunities/:id and resolves with what the server saved; a failure rejects and the listing is unchanged.
 */
export async function updateListing(id: string, fields: ListingFields, publish = false): Promise<Listing | undefined> {
  const current = getMockCollection("listings").find((listing) => listing.id === id);
  if (!current) return undefined;
  const publishing = publish && current.status !== "published";
  if (!isMockMode()) {
    const saved = toListing(await updateOpportunityApi(id, apiBody(fields, publish ? "published" : current.status, publish)));
    cacheListing(saved);
    if (publishing) startMetrics(id);
    return saved;
  }
  const next: Listing = {
    ...current,
    ...fields,
    status: publish ? "published" : current.status,
    publishedAt: publishing ? todayIsoDate() : current.publishedAt,
  };
  write(getMockCollection("listings").map((listing) => (listing.id === id ? next : listing)));
  if (publishing) startMetrics(id);
  return next;
}

/** Takes a published listing back to a draft (it stays vetted). Real mode: waits for the API; a failure rejects and nothing changes. */
export async function unpublishListing(id: string): Promise<void> {
  if (!isMockMode()) {
    const saved = await unpublishOpportunityApi(id);
    cacheListing(saved?.id ? toListing(saved) : { ...getMockCollection("listings").find((listing) => listing.id === id)!, status: "draft", publishedAt: undefined });
    return;
  }
  write(
    getMockCollection("listings").map((listing) =>
      listing.id === id ? { ...listing, status: "draft" as const, publishedAt: undefined } : listing,
    ),
  );
}

/** A newly published listing starts with no views and no applications (a known zero, not an unknown). */
function startMetrics(id: string) {
  const existing = getMockCollection("listingMetrics");
  if (existing.some((metrics) => metrics.listingId === id)) return;
  setMockCollection(
    "listingMetrics",
    [...existing, { listingId: id, views: { website: 0, app: 0 }, applications: { website: 0, app: 0 } }],
    { always: true },
  );
}
