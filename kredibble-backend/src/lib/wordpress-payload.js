/**
 * What the API sends to the website's GOD Track plugin for each synced record (GOD-T95).
 *
 * The plugin accepts only the fields in its field contract (GOD Track 2.55.1, API-INTEGRATION.md) and only plain values:
 * a record that carries a list or a nested object is refused with "Record fields must be scalar values.". Until
 * 25 Nov 2026 the API sent the whole database record, so every push failed once the key was right. These builders send
 * each resource's contract fields only, translated from the API's own field names and value lists.
 *
 * Left out on purpose:
 * - images (`logoId`, `featuredImageId`): the plugin takes WordPress media IDs and won't fetch a URL, and the API has
 *   only URLs;
 * - links to people and other records (`assignedWriter`, `vettedBy`, `partnerId`, `ownerId`, `leadId`, `userId`,
 *   `ambassadorId`, `opportunityId`, `addedBy`): the plugin wants WordPress IDs, which the API doesn't keep for users;
 * - values whose lists differ from the plugin's (`format` on listings, the ambassador `memberType`), and the scope
 *   choices Worldwide, Online Global and Multiple countries, which aren't countries the website can convert.
 */

/** The listing scope choices that are not a single country (GOD-T98). */
const NON_COUNTRY_SCOPES = new Set(['worldwide', 'online global', 'multiple countries', 'online', 'global']);

/** The website's category for each app listing type, used when no CategoryMap row says otherwise. */
const DEFAULT_WEBSITE_CATEGORY = {
  job: 'Jobs & Internships',
  jobs: 'Jobs & Internships',
  internship: 'Jobs & Internships',
  internships: 'Jobs & Internships',
  scholarship: 'Scholarships',
  scholarships: 'Scholarships',
  fellowship: 'Fellowships',
  fellowships: 'Fellowships',
  competition: 'COMPETITION',
  competitions: 'COMPETITION',
  'training-workshop': 'Training & Workshops',
  training: 'Training & Workshops',
  trainings: 'Training & Workshops',
  grant: 'Grants',
  grants: 'Grants',
  event: 'Events',
  events: 'Events',
};

const AMBASSADOR_TIERS = {
  ambassador: 'ambassador',
  senior: 'senior',
  lead: 'lead',
  'senior ambassador': 'senior',
  'campus lead': 'lead',
  'regional lead': 'lead',
};
const AMBASSADOR_STATUSES = new Set(['applicant', 'onboarding', 'active', 'dormant']);
const BENEFICIARY_SOURCES = {
  organic: 'organic',
  ambassador: 'referral',
  'ambassador-referral': 'referral',
  event: 'event',
  partner: 'partner',
  'partner-channel': 'partner',
  import: 'import',
  'bulk-import': 'import',
};

const isBlank = (value) => value === undefined || value === null;

/** A date as `YYYY-MM-DD`, or undefined. */
const dateOnly = (value) => {
  if (isBlank(value) || value === '') return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
};

/** A moment as ISO 8601 with its time zone, or undefined. */
const isoDateTime = (value) => {
  if (isBlank(value) || value === '') return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/** The first value that is filled in. */
const firstFilled = (...values) => values.find((value) => !isBlank(value) && value !== '');

/** A non-negative whole number, or undefined. */
const wholeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : undefined;
};

/** Keep only plain values the plugin accepts; drop what isn't set. */
const scalarRecord = (fields) => {
  const record = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isBlank(value)) continue;
    if (['string', 'number', 'boolean'].includes(typeof value)) record[key] = value;
  }
  return record;
};

const escapeHtml = (text) => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const SAFE_HREF = /^(https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/i;
const INLINE = /\\([\\*[\]()#\-_`])|\*\*([^\s*](?:[\s\S]*?\S)?)\*\*|\*([^\s*](?:[^*\n]*?[^\s*])?)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** One line of the description's formatting marks (see kredibble-admin/src/lib/rich-text.ts) as escaped HTML. */
const inlineHtml = (source) => {
  let html = '';
  let last = 0;
  for (const match of source.matchAll(INLINE)) {
    html += escapeHtml(source.slice(last, match.index));
    const [whole, escaped, bold, italic, linkText, href] = match;
    if (escaped !== undefined) html += escapeHtml(escaped);
    else if (bold !== undefined) html += `<strong>${inlineHtml(bold)}</strong>`;
    else if (italic !== undefined) html += `<em>${inlineHtml(italic)}</em>`;
    else if (SAFE_HREF.test(href.trim())) html += `<a href="${escapeHtml(href.trim())}">${inlineHtml(linkText)}</a>`;
    else html += escapeHtml(whole);
    last = match.index + whole.length;
  }
  return html + escapeHtml(source.slice(last));
};

/**
 * A listing description, written with the admin's formatting marks (headings, bold, italic, links, lists), as HTML for
 * the website. Everything typed is escaped first, so nothing in a description can become markup the admin didn't offer.
 * @param {string} text the stored description
 * @returns {string} HTML
 */
export const descriptionHtml = (text) => {
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(inlineHtml).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(`<${list.tag}>${list.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  for (const rawLine of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length + 1; // the page title is the h1
      blocks.push(`<h${level}>${inlineHtml(heading[2])}</h${level}>`);
    } else if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((bullet || numbered)[1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks.join('\n');
};

/**
 * The website category for an app listing type: a CategoryMap row naming this app category wins, then the defaults.
 * @param {string} type the listing's app type
 * @param {Array<{websiteCategory: string, appCategory?: string|null}>} mappings the CategoryMap rows
 * @returns {string|undefined}
 */
export const websiteCategoryFor = (type, mappings = []) => {
  const key = String(type || '').trim().toLowerCase();
  if (!key) return undefined;
  const mapped = mappings.find((row) => String(row?.appCategory || '').trim().toLowerCase() === key);
  return mapped?.websiteCategory || DEFAULT_WEBSITE_CATEGORY[key];
};

const opportunityRecord = (value, { categoryMappings }) => {
  const published = value.status === 'published' && Boolean(value.vetted);
  const country = String(value.country || '').trim();
  return scalarRecord({
    title: value.title,
    description: isBlank(value.description) ? undefined : descriptionHtml(value.description),
    organization: firstFilled(value.offeringOrganization, value.company, value.organizer),
    deadline: dateOnly(firstFilled(value.deadline, value.closesAt)),
    applicationLink: firstFilled(value.applicationLink, value.applicationUrl, value.applyUrl),
    country: country && !NON_COUNTRY_SCOPES.has(country.toLowerCase()) ? country : undefined,
    location: value.location,
    costLabel: value.costLabel,
    eventDateTime: firstFilled(value.eventDateTime, value.eventAt),
    duration: firstFilled(value.durationLabel, value.fellowshipDuration, value.trainingDuration),
    opportunityType: websiteCategoryFor(value.type, categoryMappings),
    referralCodeOnApply: Boolean(value.referralCodeOnApply || value.referralOnApply),
    vetted: Boolean(value.vetted),
    vettedDate: dateOnly(firstFilled(value.vettedAt, value.vettedOn)),
    // `published: true` is an alias of this status, and the plugin refuses aliases of one field sent together.
    status: published ? 'published' : 'draft',
  });
};

const programRecord = (value) => scalarRecord({
  title: value.title,
  programType: value.programType,
  status: value.status,
  format: value.format,
  country: value.country,
  location: value.location,
  participants: wholeNumber(value.participantCount),
  participantsTarget: wholeNumber(value.participantTarget),
  facilitators: Array.isArray(value.facilitators) ? value.facilitators.filter(Boolean).join(', ') : value.facilitators,
  notes: value.notes,
  startsAt: isoDateTime(value.startAt),
  endsAt: isoDateTime(value.endAt),
});

const partnerRecord = (value) => scalarRecord({
  organizationName: value.organizationName,
  partnerType: value.partnerType,
  stage: value.stage,
  country: value.country,
  contactName: value.contactName,
  contactEmail: value.contactEmail,
  contactPhone: value.contactPhone,
  provides: value.provides,
  source: value.sourcedBy,
  notes: value.notes,
});

const ambassadorRecord = (value) => scalarRecord({
  fullName: value.fullName,
  email: value.email,
  phone: value.phone,
  country: value.country,
  city: value.city,
  photoUrl: value.profilePhoto,
  description: value.description,
  roleTitle: value.roleTitle,
  campus: value.campus,
  tier: AMBASSADOR_TIERS[String(value.tier || '').toLowerCase()],
  status: AMBASSADOR_STATUSES.has(value.status) ? value.status : undefined,
  trained: isBlank(value.trained) ? undefined : Boolean(value.trained),
});

const beneficiaryRecord = (value) => scalarRecord({
  fullName: value.fullName,
  email: value.email,
  phone: value.phone,
  country: value.country,
  institution: value.institution,
  sourceType: BENEFICIARY_SOURCES[firstFilled(value.sourceType, value.source)],
  verified: isBlank(value.verified) ? undefined : Boolean(value.verified),
});

const socialPostRecord = (value) => scalarRecord({
  platform: value.platform,
  postTitle: value.title,
  postUrl: value.url,
  reach: wholeNumber(value.reach),
  engagement: wholeNumber(value.engagement),
  postedAt: isoDateTime(value.postedAt),
});

const BUILDERS = {
  opportunities: opportunityRecord,
  programs: programRecord,
  partners: partnerRecord,
  ambassadors: ambassadorRecord,
  beneficiaries: beneficiaryRecord,
  'social-posts': socialPostRecord,
};

/**
 * The `record` the plugin receives for one resource: only its contract fields, as plain values.
 * @param {string} resource the plugin resource (opportunities, programs, partners, ambassadors, beneficiaries, social-posts)
 * @param {object} document a Mongoose document or plain record
 * @param {{categoryMappings?: Array}} [options] CategoryMap rows, for listing categories
 * @returns {object}
 * @throws {Error} for a resource the plugin has no route for
 */
export const toWordpressRecord = (resource, document, { categoryMappings = [] } = {}) => {
  const build = BUILDERS[resource];
  if (!build) throw new Error(`No WordPress field mapping for "${resource}"`);
  const value = document?.toJSON ? document.toJSON() : document;
  return build(value || {}, { categoryMappings });
};
