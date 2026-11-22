import {
  SNOOZE_DAYS,
  hasSeenWelcome,
  isCardSnoozed,
  markWelcomeSeen,
  needsProfileWork,
  nextStep,
  snoozeCard,
  snoozeKey,
  stepRoute,
  welcomeKey,
} from '../src/lib/profile-prompts';
import type { ProfileCompletion } from '../src/lib/api';

// The gentle "Complete your profile" nudges. ALL DATA IS FAKE.

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-18T12:00:00Z').getTime();

const partly: ProfileCompletion = {
  percent: 40,
  complete: false,
  steps: [
    { id: 'basics', label: 'Your name and date of birth', done: true },
    { id: 'contact', label: 'Your country and phone number', done: false },
    { id: 'cv', label: 'Your CV', done: false },
  ],
  missing: ['contact', 'cv'],
};

describe('storage keys', () => {
  it('only use characters expo-secure-store accepts, so the choice is really remembered', () => {
    for (const id of ['6afdfd3ddb90cc0fb8ea47cb', 'user-a', 'user_b']) {
      expect(snoozeKey(id)).toMatch(/^[\w.-]+$/);
      expect(welcomeKey(id)).toMatch(/^[\w.-]+$/);
    }
  });
});

describe('putting the card away', () => {
  it('hides it for three days, then shows it again', async () => {
    expect(await isCardSnoozed('user-a', NOW)).toBe(false);
    await snoozeCard('user-a', SNOOZE_DAYS, NOW);
    expect(await isCardSnoozed('user-a', NOW + 2 * DAY)).toBe(true);
    expect(await isCardSnoozed('user-a', NOW + 3 * DAY + 1000)).toBe(false);
  });

  it('is remembered per person, not per phone', async () => {
    await snoozeCard('user-b', 3, NOW);
    expect(await isCardSnoozed('user-b', NOW + DAY)).toBe(true);
    expect(await isCardSnoozed('user-c', NOW + DAY)).toBe(false);
  });
});

describe('the welcome sheet', () => {
  it('shows once per person', async () => {
    expect(await hasSeenWelcome('user-d')).toBe(false);
    await markWelcomeSeen('user-d');
    expect(await hasSeenWelcome('user-d')).toBe(true);
    expect(await hasSeenWelcome('user-e')).toBe(false);
  });
});

describe('what is left to do', () => {
  it('finds the next step and knows when nothing is left', () => {
    expect(needsProfileWork(partly)).toBe(true);
    expect(nextStep(partly)?.id).toBe('contact');
    const done = { ...partly, percent: 100, complete: true, steps: partly.steps.map((s) => ({ ...s, done: true })), missing: [] };
    expect(needsProfileWork(done)).toBe(false);
    expect(nextStep(done)).toBeNull();
    expect(needsProfileWork(null)).toBe(false);
    expect(needsProfileWork(undefined)).toBe(false);
  });

  it('sends each step to its screen, and company verification to the existing verification screen', () => {
    expect(stepRoute('contact')).toEqual({ pathname: '/profile/complete-step', params: { step: 'contact' } });
    expect(stepRoute('verification')).toEqual({ pathname: '/hirer-profile/verification' });
  });
});
