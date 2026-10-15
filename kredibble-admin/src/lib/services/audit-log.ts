"use client";

/**
 * Audit log (mock): a small in-memory record of sensitive actions, so imports and exports of ambassador data, and account
 * changes (create, resend invite, change role, deactivate, reactivate), leave a trail that shows who did it, when and what.
 * NEVER put a password, an invite token or a full invite link in an entry: only who, which account (name and email) and what changed. Memory only (a reload clears it), like the
 * rest of the mock store.
 * TODO(backend): persist this change. The API should write these entries itself, on the server, so they cannot be skipped.
 *
 * Read it with useAuditLog() (re-renders on change) or getAuditLog(); write with recordAudit().
 */
import { useSyncExternalStore } from "react";

export type AuditAction =
  | "ambassadors.import"
  | "ambassadors.export"
  | "accounts.create"
  | "accounts.resend_invite"
  | "accounts.change_role"
  | "accounts.deactivate"
  | "accounts.reactivate"
  | "showcase.add"
  | "showcase.edit"
  | "showcase.show"
  | "showcase.hide"
  | "showcase.move"
  | "showcase.delete"
  | "showcase.category_add"
  | "showcase.category_edit"
  | "showcase.category_move"
  | "showcase.category_delete";

export interface AuditEntry {
  id: string;
  /** ISO date-time. */
  at: string;
  /** Who: the signed-in person's name and the role(s) they were using. */
  actor: string;
  action: AuditAction;
  /** One readable line, for the history list. */
  summary: string;
  /** The facts behind the summary: counts, filters, columns. Plain values only. */
  details: Record<string, string | number | boolean>;
}

let entries: AuditEntry[] = [];
const listeners = new Set<() => void>();
let counter = 0;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Adds one entry (newest first) and tells every reader. */
export function recordAudit(entry: Omit<AuditEntry, "id" | "at">): AuditEntry {
  counter += 1;
  const full: AuditEntry = { ...entry, id: `audit-${Date.now()}-${counter}`, at: new Date().toISOString() };
  entries = [full, ...entries];
  listeners.forEach((listener) => listener());
  return full;
}

/** The entries, newest first. */
export const getAuditLog = (): readonly AuditEntry[] => entries;

/** The entries, newest first; re-renders the caller whenever one is added. */
export function useAuditLog(): readonly AuditEntry[] {
  return useSyncExternalStore(subscribe, getAuditLog, () => []);
}
