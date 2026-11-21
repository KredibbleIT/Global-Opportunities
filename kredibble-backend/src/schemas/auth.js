import { z } from 'zod';
import { env } from '../config/env.js';
import { checkDateOfBirth } from '../lib/age.js';

// Top 25 most common passwords (abridged for brevity; extend as needed)
const COMMON_PASSWORDS = new Set([
  'password', '123456', '123456789', '12345678', '12345',
  '1234567', '1234567890', 'qwerty', 'abc123', 'password1',
  'admin', 'welcome', 'login', 'qwerty123', '1q2w3e4r',
  '1234', '123456789012', 'iloveyou', 'monkey', 'dragon',
  'sunshine', 'princess', 'football', 'baseball', 'superman',
]);

const isCommonPassword = (pwd) => COMMON_PASSWORDS.has(pwd.toLowerCase());

export const passwordSchema = z.string()
  .min(10, 'Password must be at least 10 characters long')
  .max(128, 'Password must be at most 128 characters long')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .refine((pwd) => !isCommonPassword(pwd), {
    message: 'Password is too common; choose a stronger one',
  });

// Public registration may only mint these two roles. 'admin' is intentionally
// absent: it must never be reachable from an anonymous request body.
const PUBLIC_ROLES = ['seeker', 'hirer'];

const GENDER_VALUES = ['female', 'male', 'other', 'prefer_not_to_say'];

export const registerSchema = z.object({
  body: z.object({
    // The app sends first and last name; older app versions send one `name`.
    name: z.string().min(2, 'Name is too short').max(50).optional(),
    firstName: z.string().trim().min(1, 'Enter your first name').max(40).optional(),
    lastName: z.string().trim().min(1, 'Enter your last name').max(40).optional(),
    dateOfBirth: z.string().optional(),
    gender: z.enum(GENDER_VALUES, { message: `Gender must be one of: ${GENDER_VALUES.join(', ')}` }).optional(),
    email: z.string().email('Invalid email format'),
    password: passwordSchema,
    role: z.enum(PUBLIC_ROLES, {
      message: `Role must be one of: ${PUBLIC_ROLES.join(', ')}`,
    }),
    // Seeker optional fields
    profession: z.string().optional(),
    university: z.string().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
    phone: z.string().optional(),
    technicalSkills: z.array(z.string()).optional(),
    // Hirer optional fields
    companyName: z.string().optional(),
    industry: z.string().optional(),
    location: z.string().optional(),
    website: z.string().optional().or(z.literal('')),
    companySize: z.string().optional(),
    companyEmail: z.string().email('Invalid company email').optional(),
    recruiterRole: z.string().optional(),
    recruiterPhone: z.string().optional(),
    recruiterLinkedin: z.string().optional().or(z.literal('')),
  }).superRefine((body, ctx) => {
    const fullName = body.name ?? [body.firstName, body.lastName].filter(Boolean).join(' ');
    if (!body.name && !(body.firstName && body.lastName)) {
      ctx.addIssue({ code: 'custom', path: ['firstName'], message: 'Enter your first and last name' });
    } else if (fullName.length < 2 || fullName.length > 50) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'Your name must be between 2 and 50 characters' });
    }

    // A date of birth is needed for the new sign-up (first and last name) and, once REQUIRE_DATE_OF_BIRTH is on, for every sign-up.
    const needsDateOfBirth = Boolean(body.firstName) || env.requireDateOfBirth;
    if (body.dateOfBirth === undefined || body.dateOfBirth === '') {
      if (needsDateOfBirth) ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'Enter your date of birth' });
    } else {
      const checked = checkDateOfBirth(body.dateOfBirth);
      if (!checked.ok) ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: checked.message });
    }
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
    newPassword: passwordSchema,
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
  }),
});

// SEC-065: deleting an account needs the password and a typed confirmation.
// Strings only, so a numeric password can't reach bcrypt.compare.
const DELETE_PASSWORD_MESSAGE = 'Password confirmation required for account deletion';
const DELETE_CONFIRMATION_MESSAGE = 'Please type "DELETE MY ACCOUNT" to confirm';

export const deleteAccountSchema = z.object({
  body: z.object({
    password: z.string({ error: DELETE_PASSWORD_MESSAGE })
      .min(1, DELETE_PASSWORD_MESSAGE)
      .max(128, DELETE_PASSWORD_MESSAGE),
    confirmation: z.literal('DELETE MY ACCOUNT', { error: DELETE_CONFIRMATION_MESSAGE }),
  }),
});

export const pushTokenSchema = z.object({
  body: z.object({
    token: z.string({ required_error: 'Token is required' }).trim().min(1, 'Token is required').max(500, 'Token is too long'),
    platform: z.enum(['ios', 'android', 'web', 'other']).optional(),
  }),
});

// SEC-138: the app's own notification switches. Only `push` lives on the server today.
export const notificationPreferencesSchema = z.object({
  body: z.object({
    push: z.boolean({ error: 'push must be true or false' }),
  }).strict(),
});

// A person's own profile picture: the address of a picture they uploaded with POST /upload?purpose=avatars, or null to remove it.
export const avatarSchema = z.object({
  body: z.object({
    avatarUrl: z.string({ error: 'avatarUrl must be a picture address or null' }).trim().url('avatarUrl must be a picture address').max(500).nullable(),
  }).strict(),
});

// "Complete your profile": what a person may fill in or change about themselves after sign-up. Nothing outside this list is accepted, and the
// handler refuses seeker-only fields from a hirer and the other way round.
const text = (max = 200) => z.string().trim().max(max);
const list = (itemMax = 100, count = 50) => z.array(text(itemMax)).max(count);
const addressOrNull = z.string().trim().url().max(500).nullable();

export const SEEKER_PROFILE_FIELDS = [
  'profession', 'university', 'country', 'city', 'phone', 'bio', 'professionalSummary', 'experienceLevel', 'currentStatus',
  'technicalSkills', 'softSkills', 'tools', 'certifications', 'preferredCountries', 'education', 'workExperience', 'projects', 'resumeUrl',
];
export const HIRER_PROFILE_FIELDS = [
  'companyName', 'tagline', 'industry', 'companySize', 'location', 'website', 'companyEmail', 'description',
  'recruiterRole', 'recruiterPhone', 'recruiterLinkedin', 'logo',
];

export const profileUpdateSchema = z.object({
  body: z.object({
    // The person
    firstName: text(40).min(1).optional(),
    lastName: text(40).min(1).optional(),
    gender: z.enum(GENDER_VALUES).nullable().optional(),
    dateOfBirth: z.string().optional(),
    // Seeker
    profession: text().min(1).optional(),
    university: text().optional(),
    country: text().optional(),
    city: text().optional(),
    phone: text(30).optional(),
    bio: text(1000).optional(),
    professionalSummary: text(1000).optional(),
    experienceLevel: text(40).optional(),
    currentStatus: text(60).optional(),
    technicalSkills: list().optional(),
    softSkills: list().optional(),
    tools: list().optional(),
    certifications: list(200).optional(),
    preferredCountries: list().optional(),
    education: z.array(z.object({ degree: text(), institution: text(), duration: text(60) }).strict()).max(20).optional(),
    workExperience: z.array(z.object({ role: text(), company: text(), location: text(), duration: text(60), bullets: list(300, 20) }).strict()).max(30).optional(),
    projects: z.array(z.object({ name: text(), bullets: list(300, 20) }).strict()).max(30).optional(),
    resumeUrl: addressOrNull.optional(),
    // Hirer
    companyName: text().min(1).optional(),
    tagline: text(160).optional(),
    industry: text().optional(),
    companySize: text(60).optional(),
    location: text().optional(),
    website: text(300).optional(),
    companyEmail: z.string().trim().email('Invalid company email').optional(),
    description: text(2000).optional(),
    recruiterRole: text().optional(),
    recruiterPhone: text(30).optional(),
    recruiterLinkedin: text(300).optional(),
    logo: addressOrNull.optional(),
  }).strict(),
});
