/**
 * An ambassador's results and the ambassador leaderboard in the app (GOD-T106).
 *
 * Both come from the same monthly calculation as the admin's Leaderboard page: ambassadors rank by verified sign-ups, then
 * referred clicks, then shares (GET /ambassador-requests/me/results and /ambassador-requests/leaderboard; current ambassadors
 * only, never anyone's email or phone).
 */
import { request } from './api';

export interface AmbassadorResults {
  /** YYYY-MM */
  month: string;
  /** null when the ambassador joined after this month or is not ranked yet */
  rank: number | null;
  /** how many ambassadors are ranked this month */
  of: number;
  signups: number;
  clicks: number;
  shares: number;
  referralCode: string | null;
  tier: string | null;
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  campus: string;
  country: string;
  tier: string;
  signups: number;
  clicks: number;
  shares: number;
  isYou: boolean;
}

export interface Leaderboard {
  month: string;
  total: number;
  rows: LeaderboardRow[];
  /** the caller's own row when they are below the top 50, otherwise null */
  you: LeaderboardRow | null;
}

export const getMyAmbassadorResults = () => request<AmbassadorResults>('/ambassador-requests/me/results');
export const getAmbassadorLeaderboard = () => request<Leaderboard>('/ambassador-requests/leaderboard');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "November 2026" for "2026-11"; the text as given when it is not a month. */
export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const index = Number(match[2]) - 1;
  return index >= 0 && index < 12 ? `${MONTHS[index]} ${match[1]}` : month;
}

/** "#2 of 14", or "Not ranked yet" when there is no rank. */
export function rankLabel(rank: number | null | undefined, of: number): string {
  return rank ? `#${rank} of ${of}` : 'Not ranked yet';
}

/** "1 sign-up" / "3 sign-ups", and the same for clicks and shares. */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Where a leaderboard row is from: "Test Campus · Ghana", whichever is known. */
export function placeLabel(row: Pick<LeaderboardRow, 'campus' | 'country'>): string {
  return [row.campus, row.country].filter((part) => part && part.trim()).join(' · ');
}
