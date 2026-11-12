/**
 * Data for Grants (/grants) and one grant with its applications (/grants/[id]) (SEC-157).
 *
 * - Mock mode: the sample grants (mock-grant-ops.ts) with this session's changes laid over them (mock-store.ts). An application's
 *   amount counts as allocated once it is approved.
 * - Real mode: GET /admin/grants, GET /admin/grants/:id and GET /admin/grant-applications?grantId=, and decisions through
 *   PATCH /admin/grant-applications/:id. On the server an application RESERVES its amount in the grant's `allocated` when it is made
 *   (SEC-060, so the pool can never be over-committed); approving keeps the reservation and rejecting releases it (SEC-157). So in
 *   real mode "allocated" includes the requests still waiting for a decision, and approving one can never exceed the pool.
 *
 * Amounts are in USD in real mode: the Grant model has no currency, and the app asks applicants for their budget "in USD".
 * Errors reject with the server's message; a missing grant resolves with undefined ("not found").
 */
import { getGrantApplications, getGrantById, getGrants, updateGrantApplication, type GrantApplicationRecord, type GrantRecord as ApiGrantRecord } from "@/lib/api";
import { grantRecords, type GrantApplication, type GrantOpsStatus, type GrantRecord } from "@/lib/mock-grant-ops";
import { overlayRows } from "@/lib/mock-store";
import { MISSING, fetchAll, isRecordId, orMissing } from "./api-helpers";
import { isMockMode } from "./mock-mode";

/** The currency of every real-mode amount (see the note above). */
export const GRANT_CURRENCY = "USD";

const APPLICATION_STATUSES: GrantApplication["status"][] = ["pending", "approved", "rejected"];

/** Maps one API application to the page's shape (an unknown status reads as pending, so it can still be decided). */
export const toGrantApplication = (record: GrantApplicationRecord): GrantApplication => ({
  id: record.id,
  applicantName: record.applicantName || MISSING,
  requestedAmount: Number(record.requestedAmount) || 0,
  status: APPLICATION_STATUSES.find((status) => status === record.status) ?? "pending",
});

/** Maps one API grant (and its applications, when loaded) to the page's shape. */
export function toGrant(record: ApiGrantRecord, applications: GrantApplicationRecord[] = []): GrantRecord {
  const status: GrantOpsStatus = record.status === "closed" ? "closed" : "open";
  return {
    id: record.id,
    title: record.title,
    hirer: record.hirer || MISSING,
    sector: record.sector || MISSING,
    currency: GRANT_CURRENCY,
    fundingPool: Number(record.fundingPool) || 0,
    allocated: Number(record.allocated) || 0,
    status,
    applications: applications.map(toGrantApplication),
  };
}

/** True when an application's amount is held in `allocated` while it waits (real mode, see the note above). */
export const pendingIsReserved = (): boolean => !isMockMode();

/** Every grant (without their applications: the list does not show them). */
export async function loadGrantRows(): Promise<GrantRecord[]> {
  if (isMockMode()) return overlayRows("grants", grantRecords);
  return (await fetchAll((page, limit) => getGrants({ page, limit }))).map((record) => toGrant(record));
}

/** One grant with every application, or undefined when there is no such grant. */
export async function loadGrant(id: string): Promise<GrantRecord | undefined> {
  if (isMockMode()) return grantRecords.find((grant) => grant.id === id);
  if (!isRecordId(id)) return undefined;
  const record = await getGrantById(id).catch(orMissing<ApiGrantRecord>);
  if (!record) return undefined;
  const applications = await fetchAll((page, limit) => getGrantApplications(id, { page, limit }));
  return toGrant(record, applications);
}

/** Whether approving this application would go over the pool. Real mode: never (its amount is already reserved). */
export function approvalExceedsPool(grant: GrantRecord, application: GrantApplication): boolean {
  if (pendingIsReserved()) return false;
  return application.requestedAmount > grant.fundingPool - grant.allocated;
}

/** Mock mode's rule: what is allocated is the sum of the approved applications. */
export const allocatedFromApplications = (applications: GrantApplication[]): number =>
  applications.filter((application) => application.status === "approved").reduce((sum, application) => sum + application.requestedAmount, 0);

/**
 * Approves or rejects a pending application and resolves with the saved status and the grant's allocated amount afterwards.
 * Real mode: PATCH /admin/grant-applications/:id, then the grant is read again for the server's `allocated`. Mock mode: allocated is
 * null, and the page works it out from its latest applications (allocatedFromApplications), so two quick decisions both count.
 */
export async function decideGrantApplication(
  grant: GrantRecord,
  applicationId: string,
  decision: Exclude<GrantApplication["status"], "pending">,
): Promise<{ status: GrantApplication["status"]; allocated: number | null }> {
  if (isMockMode()) return { status: decision, allocated: null };
  const saved = toGrantApplication(await updateGrantApplication(applicationId, { status: decision }));
  const fresh = await getGrantById(grant.id);
  return { status: saved.status, allocated: Number(fresh.allocated) || 0 };
}
