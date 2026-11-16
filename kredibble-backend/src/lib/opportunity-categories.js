/**
 * The eight opportunity categories of the app's Opportunities screen and of the admin dashboard (the Opportunities queue tabs and the
 * "Opportunity type" of a new listing). One list, so the app, the dashboard and the counts always agree.
 *
 * - `key`: the category in the counts the API returns (GET /opportunities/category-counts).
 * - `types`: every stored opportunity type that belongs to the category (singular and plural spellings, older and website-synced records).
 *   Competitions are part of "Events & Competitions" and internships of "Jobs & Internships".
 * - `createType`: the type a new listing of this category is saved with.
 */
export const OPPORTUNITY_CATEGORIES = Object.freeze([
  { key: 'events', label: 'Events & Competitions', types: ['event', 'events', 'competition', 'competitions'], createType: 'event' },
  { key: 'volunteer', label: 'Volunteerism & Community Service', types: ['volunteer', 'volunteers'], createType: 'volunteer' },
  { key: 'funding', label: 'Awards, Grants & Funding', types: ['grant', 'grants'], createType: 'grant' },
  { key: 'jobs', label: 'Jobs & Internships', types: ['job', 'jobs', 'internship', 'internships'], createType: 'job' },
  { key: 'scholarships', label: 'Scholarships', types: ['scholarship', 'scholarships'], createType: 'scholarship' },
  { key: 'fellowships', label: 'Fellowships & Exchange Programmes', types: ['fellowship', 'fellowships'], createType: 'fellowship' },
  { key: 'training', label: 'Training & Workshops', types: ['training', 'trainings', 'training-workshop'], createType: 'training' },
  { key: 'mentorship', label: 'Mentorship & Career Development', types: ['mentorship', 'mentorships'], createType: 'mentorship' },
]);

/** The category key of a stored opportunity type, or null for a type that belongs to none. */
export const categoryOfType = (type) => OPPORTUNITY_CATEGORIES.find((category) => category.types.includes(type))?.key ?? null;
