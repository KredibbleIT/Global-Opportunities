/** The youngest age at which someone may create an account. */
export const MIN_SIGNUP_AGE = 16;

/** Anything older is treated as a typing mistake. */
export const MAX_AGE = 120;

/**
 * Reads a date of birth sent as YYYY-MM-DD. Only a real calendar date counts (2026-02-30 is refused).
 * @param {unknown} value
 * @returns {Date | null} midnight UTC on that day, or null when it is not a real date
 */
export const parseDateOfBirth = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
};

/**
 * Whole years between a date of birth and a day (birthdays are counted in UTC).
 * @param {Date} dateOfBirth
 * @param {Date} [now]
 */
export const ageOn = (dateOfBirth, now = new Date()) => {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (now.getUTCMonth() === dateOfBirth.getUTCMonth() && now.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
};

/**
 * Checks a date of birth sent by a person signing up or filling in their profile.
 * @param {unknown} value YYYY-MM-DD
 * @param {Date} [now]
 * @returns {{ ok: true, date: Date } | { ok: false, message: string }}
 */
export const checkDateOfBirth = (value, now = new Date()) => {
  const date = parseDateOfBirth(value);
  if (!date) return { ok: false, message: 'Enter a valid date of birth' };
  const age = ageOn(date, now);
  if (age < 0 || age > MAX_AGE) return { ok: false, message: 'Enter a valid date of birth' };
  if (age < MIN_SIGNUP_AGE) return { ok: false, message: `You must be at least ${MIN_SIGNUP_AGE} to create an account` };
  return { ok: true, date };
};
