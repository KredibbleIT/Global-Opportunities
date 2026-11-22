import * as SecureStore from 'expo-secure-store';
import type { ProfileCompletion, ProfileStep } from './api';

// "Complete your profile" nudges. They are gentle: the welcome sheet shows once, and the card on Home can be put away for a few days.
// What is remembered lives on this phone, per person.

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long "Not now" hides the card on Home. */
export const SNOOZE_DAYS = 3;

// expo-secure-store only accepts letters, digits, ".", "-" and "_" in a key (a ":" is refused), so the person's id is joined with a dot.
export const snoozeKey = (userId: string) => `profileCardSnoozeUntil.${userId}`;
export const welcomeKey = (userId: string) => `profileWelcomeSeen.${userId}`;

const read = async (key: string): Promise<string | null> => {
  try {
    return (await SecureStore.getItemAsync(key)) ?? null;
  } catch {
    return null;
  }
};

const write = async (key: string, value: string): Promise<void> => {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Not remembered: the nudge may show again, which is harmless.
  }
};

/** True while the person has put the Home card away. */
export const isCardSnoozed = async (userId: string, now: number = Date.now()): Promise<boolean> => {
  const until = Number(await read(snoozeKey(userId)));
  return Number.isFinite(until) && until > now;
};

export const snoozeCard = (userId: string, days: number = SNOOZE_DAYS, now: number = Date.now()): Promise<void> =>
  write(snoozeKey(userId), String(now + days * DAY_MS));

export const hasSeenWelcome = async (userId: string): Promise<boolean> => (await read(welcomeKey(userId))) === 'true';

export const markWelcomeSeen = (userId: string): Promise<void> => write(welcomeKey(userId), 'true');

/** Whether there is anything left to ask for. */
export const needsProfileWork = (completion: ProfileCompletion | null | undefined): completion is ProfileCompletion =>
  Boolean(completion) && !completion!.complete;

/** The first step still to do, or null when all are done. */
export const nextStep = (completion: ProfileCompletion | null | undefined): ProfileStep | null =>
  completion?.steps.find((step) => !step.done) ?? null;

/** Where each step is done. Hirer verification already has its own screen; the others share one form screen. */
export const stepRoute = (stepId: string): { pathname: string; params?: Record<string, string> } =>
  stepId === 'verification' ? { pathname: '/hirer-profile/verification' } : { pathname: '/profile/complete-step', params: { step: stepId } };

/** One line of help under each step on the checklist. */
export const STEP_HELP: Record<string, string> = {
  basics: 'Needed to confirm your age.',
  contact: 'So we can show opportunities near you and reach you.',
  education: 'Helps match you with scholarships, internships and jobs.',
  career: 'The more we know, the better your matches.',
  cv: 'Employers ask for it when you apply. You can add it now or when you apply.',
  company: 'Candidates want to know who they are applying to.',
  recruiter: 'Who candidates will hear from.',
  verification: 'Verified companies build trust with candidates.',
};
