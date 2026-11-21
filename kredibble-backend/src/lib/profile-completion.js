/**
 * How much of their profile a person has filled in, for the "Complete your profile" card in the app.
 *
 * A profile is a short list of steps. A step is done or not done, and the percentage is done / total. The server works it out so the app, the
 * admin dashboard and any later reminder agree. Placeholder values the server fills in itself ("Not specified", the default profession) never
 * count as filled in.
 *
 * @typedef {{ id: string, label: string, done: boolean }} CompletionStep
 * @typedef {{ percent: number, complete: boolean, steps: CompletionStep[], missing: string[] }} ProfileCompletion
 */

const PLACEHOLDER = /^(not specified|opportunity seeker|n\/a|-|)$/i;

const filled = (value) => typeof value === 'string' && !PLACEHOLDER.test(value.trim());

/** Skill-like lists are stored as JSON text; this reads that or a real array. */
const listOf = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const seekerSteps = (user, profile) => [
  // Done at sign-up. An older account that never gave a date of birth is asked for it here.
  { id: 'basics', label: 'Your name and date of birth', done: Boolean(user.name && user.dateOfBirth) },
  { id: 'contact', label: 'Your country and phone number', done: filled(profile?.country) && filled(profile?.phone) },
  { id: 'education', label: 'Your education', done: filled(profile?.university) || listOf(profile?.education).length > 0 },
  { id: 'career', label: 'Your career interest and skills', done: filled(profile?.profession) && listOf(profile?.technicalSkills).length > 0 },
  { id: 'cv', label: 'Your CV', done: filled(profile?.resumeUrl) },
];

const hirerSteps = (user, profile) => [
  { id: 'basics', label: 'Your name and date of birth', done: Boolean(user.name && user.dateOfBirth) },
  {
    id: 'company',
    label: 'Your company details',
    done: filled(profile?.industry) && filled(profile?.location) && filled(profile?.companySize),
  },
  { id: 'recruiter', label: 'Your role and phone number', done: filled(profile?.recruiterRole) && filled(profile?.recruiterPhone) },
  {
    id: 'verification',
    label: 'Verify your company',
    done: Boolean(profile?.verified) || (filled(profile?.verification) && !/^pending$/i.test(profile.verification)),
  },
];

/**
 * @param {{ role?: string, name?: string, dateOfBirth?: unknown }} user the account
 * @param {object | null | undefined} profile their SeekerProfile or HirerAccount
 * @returns {ProfileCompletion | null} null for accounts that have no profile to complete (admins)
 */
export const profileCompletion = (user, profile) => {
  let steps;
  if (user?.role === 'seeker') steps = seekerSteps(user, profile);
  else if (user?.role === 'hirer') steps = hirerSteps(user, profile);
  else return null;

  const done = steps.filter((step) => step.done).length;
  return {
    percent: Math.round((done / steps.length) * 100),
    complete: done === steps.length,
    steps,
    missing: steps.filter((step) => !step.done).map((step) => step.id),
  };
};
