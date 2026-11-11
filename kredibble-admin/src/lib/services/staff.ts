/**
 * Staff service: the ONE place that reads and changes the team. The Team page, the invite form, /staff/[id] and the
 * scorecards (and any "assigned owner" choice) all go through these functions, so a person exists once and every
 * screen agrees about who is on the team.
 *
 * In mock mode (NEXT_PUBLIC_USE_MOCKS=true) it reads and writes to the shared in-memory mock store.
 * In live mode, it reads and persists to the backend API while keeping the local cache updated for reactive UI.
 */
import { KPIS, type KpiKey } from "@/config/kpis";
import type { Role } from "@/config/roles";
import { MAX_STAFF_ROLES } from "@/config/staff-roles";
import type { StaffMember, StaffStatus } from "@/lib/mock-entities";
import { getMockCollection, setMockCollection, subscribeMockStore } from "@/lib/mock-store";
import { isMockMode } from "@/lib/services/mock-mode";
import { orMissing } from "@/lib/services/api-helpers";
import {
  getStaff,
  getStaffById,
  inviteStaff as apiInviteStaff,
  updateStaff as apiUpdateStaff,
  deleteStaff as apiDeleteStaff,
} from "@/lib/api";

/** Tells a list or detail hook to reload when the team changes. */
export const subscribeStaff = subscribeMockStore;

interface StaffApiRecord {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  roles?: Role[];
  role?: string;
  status?: string;
  joinedDate?: string;
  createdAt?: string;
}

const write = (rows: StaffMember[]) => setMockCollection("staff", rows, { always: true });

/**
 * Keeps the team the API returned in this browser's store, so every screen that reads the store agrees with it.
 * Only a real change is written (SEC-146): every write notifies the store's subscribers, the Team list subscribes and
 * reloads, and writing the same rows again made it ask the API for the team about 50 times a second, which used up
 * the admin's whole rate-limit allowance in about 2 seconds. Same rule as cacheListings (services/listings.ts).
 */
function cacheStaff(rows: StaffMember[]): void {
  if (JSON.stringify(getMockCollection("staff")) === JSON.stringify(rows)) return;
  write(rows);
}

/** A staff record as the API sends it, in the shape the pages use. */
const toStaffMember = (record: StaffApiRecord): StaffMember => ({
  id: record.id || record._id || "",
  name: record.name,
  email: record.email,
  roles: (Array.isArray(record.roles) && record.roles.length > 0 ? record.roles : [record.role || "support"]).slice(0, MAX_STAFF_ROLES) as Role[],
  status: record.status === "suspended" ? "suspended" : "active",
  joinedDate: record.joinedDate || (record.createdAt ? new Date(record.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
});

/**
 * The team. Real mode asks the API and rejects when it fails, so the Team page shows its error and Retry. It never
 * falls back to the store, which starts from the sample team even with Mock data off: a failed request used to list
 * sample people as the desk's staff (SEC-148).
 */
export const loadStaffRows = async (): Promise<StaffMember[]> => {
  if (isMockMode()) return [...getMockCollection("staff")];
  const res = await getStaff({ limit: 100 });
  const staffList = ((res.data || []) as unknown as StaffApiRecord[]).map(toStaffMember);
  cacheStaff(staffList);
  return staffList;
};

/** One team member. Real mode: the API's record, undefined on a 404 ("not found"); any other failure rejects (SEC-148). */
export const loadStaffMember = async (id: string): Promise<StaffMember | undefined> => {
  if (isMockMode()) return getMockCollection("staff").find((person) => person.id === id);
  const item = await getStaffById<StaffApiRecord>(id).catch(orMissing<StaffApiRecord>);
  if (!item) return undefined;
  const data = (typeof item === "object" && "data" in item ? (item as { data: StaffApiRecord }).data : item) as StaffApiRecord;
  return toStaffMember(data);
};

/** The team as it is in the store right now (a plain read, for rules that need everyone, such as "is this email taken"). */
export const loadStaffSnapshot = (): StaffMember[] => getMockCollection("staff");

// Real mode: every change below waits for the API and throws its error (ApiError), so the page can show it. Only a
// Super Admin may add staff or change their roles or status (SEC-134); the server refuses anyone else.

/** Adds a person to the team (newest first). One role, or two (anything beyond MAX_STAFF_ROLES is dropped). */
export async function inviteStaff(name: string, email: string, roles: Role | Role[]): Promise<StaffMember> {
  const normalizedRoles = (Array.isArray(roles) ? roles : [roles]).slice(0, MAX_STAFF_ROLES) as Role[];
  let id = `staff-${Date.now()}`;
  if (!isMockMode()) {
    const created = await apiInviteStaff({ name, email, roles: normalizedRoles });
    id = created.id || id;
  }
  const person: StaffMember = {
    id,
    name,
    email,
    roles: normalizedRoles,
    status: "active",
    joinedDate: new Date().toISOString().slice(0, 10),
  };
  write([person, ...getMockCollection("staff")]);
  return person;
}

/** Gives a person one or two roles (anything else is ignored). */
export async function setStaffRoles(id: string, roles: Role[]): Promise<void> {
  if (roles.length < 1 || roles.length > MAX_STAFF_ROLES) return;
  if (!isMockMode()) await apiUpdateStaff(id, { roles });
  write(getMockCollection("staff").map((person) => (person.id === id ? { ...person, roles } : person)));
}

/** Suspends a person or reinstates them. The caller says which: the store may not hold the person in real mode. */
export async function setStaffStatus(id: string, status: Extract<StaffStatus, "active" | "suspended">): Promise<void> {
  if (!isMockMode()) await apiUpdateStaff(id, { status });
  write(getMockCollection("staff").map((person) => (person.id === id ? { ...person, status } : person)));
}

/** Removes a person from the team. The server keeps their record, deactivated, and signs them out. */
export async function removeStaffMember(id: string): Promise<void> {
  if (!isMockMode()) await apiDeleteStaff(id);
  write(getMockCollection("staff").filter((person) => person.id !== id));
}

/** The people held to a KPI: active team members who hold one of its owner roles. This is the list any scorecard or owner choice uses. */
export function staffOwningKpi(key: KpiKey, people: StaffMember[] = getMockCollection("staff")): StaffMember[] {
  const owners = KPIS[key].owners;
  return people.filter((person) => person.status === "active" && person.roles.some((role) => owners.includes(role)));
}
