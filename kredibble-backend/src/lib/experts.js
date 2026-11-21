/**
 * The Expert listing: seekers who asked to be shown to other people, and whom an admin approved.
 * Shared by the app's routes (routes/experts.js) and the admin review routes.
 */

const asList = (value) => {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const textList = (value) => asList(value).map((item) => String(item ?? '').trim()).filter(Boolean);

export const EXPERT_STATUSES = ['none', 'pending', 'approved', 'rejected', 'hidden'];

/** What a seeker still has to fill in before they can apply: what a hirer or another seeker reads first. */
export function expertMissing(profile) {
  const missing = [];
  if (!String(profile?.profession || '').trim()) missing.push('profession');
  if (!String(profile?.professionalSummary || profile?.bio || '').trim()) missing.push('summary');
  if (textList(profile?.technicalSkills).length === 0) missing.push('skills');
  return missing;
}

/** A website as a full address the app can open. */
const websiteAddress = (value) => {
  const text = String(value || '').trim();
  if (!text) return undefined;
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
};

/**
 * The public face of an expert. Contact details are only here when the seeker switched them on; the login email, the phone and
 * the CV are never sent otherwise, and nothing about the review is shown.
 */
export function publicExpert(profile, user, { includeDetail = false } = {}) {
  const contact = {};
  if (profile.expertShowEmail && user?.email) contact.email = user.email;
  if (profile.expertShowPhone && profile.phone) contact.phone = profile.phone;
  if (profile.expertShowWebsite && profile.expertWebsite) contact.website = websiteAddress(profile.expertWebsite);

  const base = {
    id: String(profile._id),
    name: user?.name || 'Expert',
    image: user?.avatarUrl || undefined,
    profession: profile.profession,
    verified: Boolean(profile.verified),
    city: profile.city || '',
    country: profile.country || '',
    location: [profile.city, profile.country].filter(Boolean).join(', '),
    university: profile.university || undefined,
    bio: profile.bio || '',
    experienceLevel: profile.experienceLevel || undefined,
    technicalSkills: textList(profile.technicalSkills),
    rating: Math.round((profile.expertRatingAverage || 0) * 10) / 10,
    ratingCount: profile.expertRatingCount || 0,
    contact,
  };
  if (!includeDetail) return base;
  return {
    ...base,
    professionalSummary: profile.professionalSummary || '',
    softSkills: textList(profile.softSkills),
    tools: textList(profile.tools),
    certifications: textList(profile.certifications),
    education: asList(profile.education),
    workExperience: asList(profile.workExperience),
    projects: asList(profile.projects),
  };
}

/** The seeker's own view of where they stand. */
export function expertOwnState(profile) {
  if (!profile) {
    return { status: 'none', eligible: false, missing: ['profession', 'summary', 'skills'], showEmail: false, showPhone: false, showWebsite: false, rating: 0, ratingCount: 0 };
  }
  const missing = expertMissing(profile);
  const status = profile.expertStatus || 'none';
  return {
    status,
    eligible: missing.length === 0,
    missing,
    showEmail: Boolean(profile.expertShowEmail),
    showPhone: Boolean(profile.expertShowPhone),
    showWebsite: Boolean(profile.expertShowWebsite),
    website: profile.expertWebsite || '',
    // The reviewer's reason is only the seeker's business when it asks them to change something.
    reviewNote: status === 'rejected' || status === 'hidden' ? profile.expertReviewNote || undefined : undefined,
    appliedAt: profile.expertAppliedAt || undefined,
    rating: Math.round((profile.expertRatingAverage || 0) * 10) / 10,
    ratingCount: profile.expertRatingCount || 0,
    profileId: String(profile._id),
  };
}
