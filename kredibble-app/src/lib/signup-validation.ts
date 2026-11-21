// What the short sign-up screen checks before it asks the server. The server checks the same rules again, so these only save a round trip and
// give an answer next to the field.

/** The youngest age at which someone may create an account (the server enforces the same number). */
export const MIN_SIGNUP_AGE = 16;
const MAX_AGE = 120;

export const GENDER_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;

export type GenderValue = (typeof GENDER_OPTIONS)[number]['value'];

/** Whole years between a date of birth and a day. */
export const ageOn = (year: number, month: number, day: number, now: Date = new Date()): number => {
  let age = now.getUTCFullYear() - year;
  if (now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)) age -= 1;
  return age;
};

export type DateOfBirthResult = { ok: true; value: string } | { ok: false; message: string };

/**
 * Turns the day, month and year someone typed into YYYY-MM-DD, or says what is wrong with them.
 * Only a real calendar date counts (30 February is refused) and the person must be at least 16.
 */
export const checkDateOfBirth = (day: string, month: string, year: string, now: Date = new Date()): DateOfBirthResult => {
  if (!day.trim() || !month.trim() || !year.trim()) return { ok: false, message: 'Enter your date of birth' };
  if (!/^\d{1,2}$/.test(day.trim()) || !/^\d{1,2}$/.test(month.trim()) || !/^\d{4}$/.test(year.trim())) {
    return { ok: false, message: 'Enter your date of birth as day, month and a four-digit year' };
  }
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || m > 12 || d < 1 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, message: 'Enter a valid date of birth' };
  }
  const age = ageOn(y, m, d, now);
  if (age < 0 || age > MAX_AGE) return { ok: false, message: 'Enter a valid date of birth' };
  if (age < MIN_SIGNUP_AGE) return { ok: false, message: `You must be at least ${MIN_SIGNUP_AGE} to create an account` };
  return { ok: true, value: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
};

const COMMON_PASSWORDS = new Set(['password', '1234567890', 'password1', 'qwerty123', '123456789012', 'iloveyou', 'welcome']);

/** The same password rules as the server. Returns what is missing, or null when the password is fine. */
export const passwordProblem = (password: string): string | null => {
  if (password.length < 10) return 'Use at least 10 characters';
  if (password.length > 128) return 'Use at most 128 characters';
  if (!/[a-z]/.test(password)) return 'Add a lowercase letter';
  if (!/[A-Z]/.test(password)) return 'Add an uppercase letter';
  if (!/[0-9]/.test(password)) return 'Add a number';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'That password is too common. Choose a stronger one';
  return null;
};

export type SignupFields = {
  firstName: string;
  lastName: string;
  day: string;
  month: string;
  year: string;
  email: string;
  password: string;
};

export type SignupErrors = Partial<Record<'firstName' | 'lastName' | 'dateOfBirth' | 'email' | 'password', string>>;

/** Everything wrong with the form right now, keyed by field. Empty when it can be sent. */
export const validateSignup = (fields: SignupFields, now: Date = new Date()): SignupErrors => {
  const errors: SignupErrors = {};
  const first = fields.firstName.trim();
  const last = fields.lastName.trim();
  if (!first) errors.firstName = 'Enter your first name';
  else if (first.length > 40) errors.firstName = 'Your first name is too long';
  if (!last) errors.lastName = 'Enter your last name';
  else if (last.length > 40) errors.lastName = 'Your last name is too long';
  if (!errors.firstName && !errors.lastName && first.length + last.length + 1 > 50) errors.lastName = 'Your name must be 50 characters or fewer';

  const dob = checkDateOfBirth(fields.day, fields.month, fields.year, now);
  if (!dob.ok) errors.dateOfBirth = dob.message;

  if (!/^\S+@\S+\.\S+$/.test(fields.email.trim())) errors.email = 'Enter a valid email address';
  const password = passwordProblem(fields.password);
  if (password) errors.password = password;
  return errors;
};

/**
 * The server's message for a refused sign-up, without its "Validation failed: field:" wrapper, so it reads as a sentence.
 * "Validation failed: dateOfBirth: You must be at least 16 to create an account" becomes "You must be at least 16 to create an account".
 */
export const friendlyServerMessage = (message: string): string => {
  const trimmed = message.replace(/^Validation failed:\s*/i, '');
  return trimmed
    .split(/,\s*(?=\w+(?:\.\w+)*:\s)/)
    .map((part) => part.replace(/^\w+(?:\.\w+)*:\s*/, ''))
    .join('. ');
};
