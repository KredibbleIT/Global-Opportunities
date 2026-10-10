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

export const loadStaffRows = async (): Promise<StaffMember[]> => {
  if (isMockMode()) {
    return Promise.resolve([...getMockCollection("staff")]);
  }
  try {
    const res = await getStaff({ limit: 100 });
    const rawItems = (res.data || []) as unknown as StaffApiRecord[];
    const staffList: StaffMember[] = rawItems.map((item) => ({
      id: item.id || item._id || "",
      name: item.name,
      email: item.email,
      roles: (Array.isArray(item.roles) && item.roles.length > 0 ? item.roles : [item.role || "support"]).slice(0, MAX_STAFF_ROLES) as Role[],
      status: (item.status === "suspended" ? "suspended" : "active") as "active" | "suspended",
      joinedDate: item.joinedDate || (item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
    }));
    write(staffList);
    return staffList;
  } catch {
    return [...getMockCollection("staff")];
  }
};

export const loadStaffMember = async (id: string): Promise<StaffMember | undefined> => {
  if (isMockMode()) {
    return Promise.resolve(getMockCollection("staff").find((person) => person.id === id));
  }
  try {
    const item = await getStaffById<StaffApiRecord>(id);
    const data = ((item && typeof item === "object" && "data" in item)
      ? (item as { data: StaffApiRecord }).data
      : item) as StaffApiRecord;
    const mapped: StaffMember = {
      id: data.id || data._id || "",
      name: data.name,
      email: data.email,
      roles: (Array.isArray(data.roles) && data.roles.length > 0 ? data.roles : [data.role || "support"]).slice(0, MAX_STAFF_ROLES) as Role[],
      status: (data.status === "suspended" ? "suspended" : "active") as "active" | "suspended",
      joinedDate: data.joinedDate || (data.createdAt ? new Date(data.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
    };
    return mapped;
  } catch {
    return getMockCollection("staff").find((person) => person.id === id);
  }
};

/** Adds a person to the team (newest first). One role, or two (anything beyond MAX_STAFF_ROLES is dropped). */
export function inviteStaff(name: string, email: string, roles: Role | Role[]): StaffMember {
  const normalizedRoles = (Array.isArray(roles) ? roles : [roles]).slice(0, MAX_STAFF_ROLES) as Role[];
  const person: StaffMember = {
    id: `staff-${Date.now()}`,
    name,
    email,
    roles: normalizedRoles,
    status: "active",
    joinedDate: new Date().toISOString().slice(0, 10),
  };
  write([person, ...getMockCollection("staff")]);

  if (!isMockMode()) {
    apiInviteStaff({ name, email, roles: normalizedRoles }).catch(() => {
      // Background sync, fallback stays in local store
    });
  }
  return person;
}

/** Gives a person one or two roles (anything else is ignored). */
export function setStaffRoles(id: string, roles: Role[]) {
  if (roles.length < 1 || roles.length > MAX_STAFF_ROLES) return;
  const updated = getMockCollection("staff").map((person) => (person.id === id ? { ...person, roles } : person));
  write(updated);

  if (!isMockMode()) {
    apiUpdateStaff(id, { roles }).catch(() => {});
  }
}

export function toggleStaffStatus(id: string) {
  const current = getMockCollection("staff").find((person) => person.id === id);
  const nextStatus: StaffStatus = current?.status === "active" ? "suspended" : "active";
  const updated = getMockCollection("staff").map((person) =>
    person.id === id ? { ...person, status: nextStatus } : person
  );
  write(updated);

  if (!isMockMode()) {
    apiUpdateStaff(id, { status: nextStatus }).catch(() => {});
  }
}

export function removeStaffMember(id: string) {
  const updated = getMockCollection("staff").filter((person) => person.id !== id);
  write(updated);

  if (!isMockMode()) {
    apiDeleteStaff(id).catch(() => {});
  }
}

/** The people held to a KPI: active team members who hold one of its owner roles. This is the list any scorecard or owner choice uses. */
export function staffOwningKpi(key: KpiKey, people: StaffMember[] = getMockCollection("staff")): StaffMember[] {
  const owners = KPIS[key].owners;
  return people.filter((person) => person.status === "active" && person.roles.some((role) => owners.includes(role)));
}
