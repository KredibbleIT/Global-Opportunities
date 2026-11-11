import { ReferenceDataList } from '../models/AdminPortal.js';

export const DEFAULT_REFERENCE_GROUPS = [
  {
    key: 'seeker',
    label: 'Seekers',
    description: 'Reference lists shown as dropdowns during Seeker signup and profile editing.',
    lists: [
      {
        key: 'universities',
        label: 'Universities',
        singular: 'university',
        items: [
          'Ashesi University',
          'Cairo University',
          'Cambridge University',
          'Columbia University',
          'Harvard University',
          'Johns Hopkins University',
          'Kwame Nkrumah University of Science and Technology',
          'London School of Economics',
          'Makerere University',
          'MIT',
          'National University of Singapore',
          'Oxford University',
          'Princeton University',
          'Stanford University',
          'University of Cape Town',
          'University of Ghana',
          'University of Lagos',
          'University of Nairobi',
          'University of Sydney',
          'University of Toronto',
          'Yale University',
        ],
      },
      {
        key: 'programs',
        label: 'Programs',
        singular: 'program',
        items: [
          'Accounting',
          'Agriculture',
          'Architecture',
          'Business Administration',
          'Chemical Engineering',
          'Civil Engineering',
          'Computer Science',
          'Data Science',
          'Economics',
          'Education',
          'Electrical Engineering',
          'Environmental Science',
          'Finance',
          'Information Technology',
          'International Relations',
          'Law',
          'Marketing',
          'Mathematics',
          'Mechanical Engineering',
          'Medicine',
          'Nursing',
          'Pharmacy',
          'Psychology',
          'Public Health',
          'Software Engineering',
        ],
      },
      {
        key: 'skills',
        label: 'Skills',
        singular: 'skill',
        items: [
          'Data Analysis',
          'Project Management',
          'Digital Marketing',
          'Public Speaking',
          'Content Writing',
          'Graphic Design',
          'Financial Literacy',
          'Critical Thinking',
          'Team Collaboration',
          'Communication',
          'Leadership',
          'Problem Solving',
          'Time Management',
          'Research & Analysis',
          'Microsoft Excel',
          'Python Programming',
          'JavaScript',
          'SQL',
          'UI/UX Design',
          'Video Editing',
          'Negotiation',
          'Customer Service',
          'Event Planning',
          'Fundraising',
        ],
      },
      {
        key: 'career-interests',
        label: 'Career Interests',
        singular: 'career interest',
        items: [
          'Software Engineering',
          'Investment Banking',
          'Public Health',
          'Agribusiness Management',
          'Corporate Law',
          'Human Resource Management',
          'Data Science',
          'Supply Chain Logistics',
          'Renewable Energy Engineering',
          'Architecture & Urban Planning',
          'Education & Training',
          'Medical Research',
          'International Development',
          'Environmental Engineering',
          'Entrepreneurship',
          'Digital Marketing',
          'Finance & Accounting',
          'Journalism & Media',
          'Public Policy',
          'Social Work',
        ],
      },
      {
        key: 'countries',
        label: 'Countries',
        singular: 'country',
        items: [
          'Ghana',
          'Nigeria',
          'Kenya',
          'South Africa',
          'Egypt',
          'Rwanda',
          'Uganda',
          'Tanzania',
          'Ethiopia',
          'Zimbabwe',
          'United Kingdom',
          'United States',
          'Canada',
          'Germany',
          'France',
        ],
      },
    ],
  },
  {
    key: 'hirer',
    label: 'Hirers',
    description: 'Reference lists shown as dropdowns during Hirer signup and company profile editing.',
    lists: [
      {
        key: 'industries',
        label: 'Industries',
        singular: 'industry',
        items: [
          'Technology',
          'Education',
          'Finance',
          'Healthcare',
          'Marketing',
          'Nonprofit/NGO',
          'Government',
          'Media',
          'Agriculture',
          'Other',
        ],
      },
      {
        key: 'company-sizes',
        label: 'Company Sizes',
        singular: 'company size',
        items: [
          '1–10 employees',
          '11–50 employees',
          '51–200 employees',
          '201–500 employees',
          '500–1,000 employees',
          '1,000+ employees',
        ],
      },
      {
        key: 'position-roles',
        label: 'Position Roles',
        singular: 'position role',
        items: [
          'HR Manager',
          'Recruiter',
          'Talent Acquisition Specialist',
          'Hiring Manager',
          'Program Coordinator',
          'Founder/CEO',
          'Operations Manager',
          'University Representative',
          'Internship Coordinator',
          'Other',
        ],
      },
    ],
  },
  {
    key: 'grants',
    label: 'Grants',
    description: 'Reference lists shown as filters and dropdowns in the Grants section of the app.',
    lists: [
      {
        key: 'sectors',
        label: 'Sectors',
        singular: 'sector',
        items: [
          'Administration',
          'Advocacy',
          'Agriculture and rural development',
          'Border management',
          'Civic engineering',
          'Community development & NGO',
          'Culture & arts',
          'Education',
          'Environment',
          'Health',
          'Human rights',
          'Humanitarian aid',
          'Infrastructure',
          'Legal & governance',
          'Media & communications',
          'Peacebuilding',
          'Water & sanitation',
        ],
      },
      {
        key: 'applicant-types',
        label: 'Applicant Types',
        singular: 'applicant type',
        items: [
          'NGOs / nonprofit organization',
          'Government / public bodies',
          'Academic institution',
          'Private sector',
          'Unrestricted / unspecific',
          'Individuals',
          'Others',
        ],
      },
      {
        key: 'funding-agencies',
        label: 'Funding Agencies',
        singular: 'funding agency',
        items: [
          'AF - adaptation fund',
          'Alliance - alliance for public health',
          'Academic institution',
          'Others',
        ],
      },
    ],
  },
];

const DEFAULT_REFERENCE_ALIASES = {
  seeker: {
    universities: [
      { alias: 'KNUST', item: 'Kwame Nkrumah University of Science and Technology' },
      { alias: 'LSE', item: 'London School of Economics' },
      { alias: 'UCT', item: 'University of Cape Town' },
      { alias: 'U of T', item: 'University of Toronto' },
    ],
    programs: [
      { alias: 'CS', item: 'Computer Science' },
      { alias: 'Comp Sci', item: 'Computer Science' },
      { alias: 'IT', item: 'Information Technology' },
      { alias: 'Econ', item: 'Economics' },
      { alias: 'MPH', item: 'Public Health' },
    ],
    skills: [
      { alias: 'Excel', item: 'Microsoft Excel' },
      { alias: 'MS Excel', item: 'Microsoft Excel' },
      { alias: 'Python', item: 'Python Programming' },
      { alias: 'UX Design', item: 'UI/UX Design' },
    ],
    'career-interests': [
      { alias: 'SWE', item: 'Software Engineering' },
      { alias: 'Investment Banking', item: 'Investment Banking' },
    ],
  },
};

// User-submitted additions are intentionally limited to the four seeker lists shown during registration.
const USER_ADDABLE_LISTS = new Set(['universities', 'programs', 'skills', 'career-interests']);

// Matching control characters is the point here: they are refused in user-submitted labels.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const INVALID_CHARACTERS = /[^\p{L}\p{N}\p{M} &/().,:+'\-’]/u;
const EMAIL_OR_URL = /(?:\S+@\S+\.\S+|https?:\/\/|www\.)/i;
const PHONE_NUMBER = /\+?\d[\d\s().-]{7,}\d/;

export function normalizeReferenceValue(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function referenceTokens(normalized) {
  return new Set(normalized.split(' ').filter(Boolean));
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left.charCodeAt(i - 1) === right.charCodeAt(j - 1) ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function similarity(left, right) {
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) return 1;
  return 1 - (levenshteinDistance(left, right) / maxLength);
}

function jaccardSimilarity(left, right) {
  const leftTokens = referenceTokens(left);
  const rightTokens = referenceTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

function referenceLookup(list) {
  const items = list.items ?? [];
  const normalizedItems = list.normalizedItems?.length === items.length
    ? list.normalizedItems
    : items.map(normalizeReferenceValue);
  const aliases = list.aliases ?? [];
  return { items, normalizedItems, aliases };
}

function ensureUsableLabel(rawValue) {
  const value = rawValue.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (value.length < 2 || value.length > 80) {
    throw invalidReferenceListItem('Use between 2 and 80 characters.');
  }
  if (CONTROL_CHARACTERS.test(value) || INVALID_CHARACTERS.test(value)) {
    throw invalidReferenceListItem('Use letters, numbers, spaces and basic punctuation only.');
  }
  if (EMAIL_OR_URL.test(value)) {
    throw invalidReferenceListItem('Links and email addresses are not allowed here.');
  }
  if (PHONE_NUMBER.test(value)) {
    throw invalidReferenceListItem('Phone numbers are not allowed here.');
  }
  if (!referenceTokens(normalizeReferenceValue(value)).size) {
    throw invalidReferenceListItem('Enter a real name or description.');
  }
  return value;
}

function invalidReferenceListItem(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'REFERENCE_ITEM_INVALID';
  return error;
}

export function findReferenceMatches(
  list,
  rawValue,
) {
  const { items, normalizedItems, aliases } = referenceLookup(list);
  const value = ensureUsableLabel(rawValue);
  const normalized = normalizeReferenceValue(value);

  const exactIndex = normalizedItems.findIndex((candidate) => candidate === normalized);
  if (exactIndex !== -1) {
    return { kind: 'exact', item: items[exactIndex], normalized };
  }

  const alias = aliases.find((entry) => entry.normalized === normalized);
  if (alias && items.includes(alias.item)) {
    return { kind: 'alias', item: alias.item, normalized, alias: alias.alias };
  }

  const matches = items
    .map((item, index) => {
      const candidate = normalizedItems[index] ?? normalizeReferenceValue(item);
      const contains = candidate.includes(normalized) || normalized.includes(candidate);
      const levenshtein = similarity(normalized, candidate);
      const jaccard = jaccardSimilarity(normalized, candidate);
      const score = contains ? Math.max(0.9, levenshtein) : Math.max(levenshtein, jaccard);
      return { item, score };
    })
    .filter(({ item, score }) => score >= 0.74 || jaccardSimilarity(normalized, normalizeReferenceValue(item)) >= 0.5)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(({ item }) => item);

  if (matches.length > 0) return { kind: 'similar', normalized, matches };
  return { kind: 'new', normalized };
}

async function backfillReferenceList(group, key) {
  const list = await ReferenceDataList.findOne({ group, key });
  if (!list) return null;

  const normalizedItems = list.items.map(normalizeReferenceValue);
  const aliases = Array.isArray(list.aliases) ? list.aliases.filter((alias) => list.items.includes(alias.item)) : [];
  const existingAliases = new Set(aliases.map((alias) => alias.normalized));
  const defaults = DEFAULT_REFERENCE_ALIASES[group]?.[key] ?? [];

  for (const entry of defaults) {
    const aliasNormalized = normalizeReferenceValue(entry.alias);
    if (list.items.includes(entry.item) && !existingAliases.has(aliasNormalized)) {
      aliases.push({ ...entry, normalized: aliasNormalized, source: 'seed' });
      existingAliases.add(aliasNormalized);
    }
  }

  const nextUpdate = {
    normalizedItems,
    aliases,
  };
  const current = {
    normalizedItems: list.normalizedItems ?? [],
    aliases: list.aliases ?? [],
  };

  if (JSON.stringify(current) !== JSON.stringify(nextUpdate)) {
    list.normalizedItems = normalizedItems;
    list.aliases = aliases;
    await list.save();
  }

  return list;
}

export async function addReferenceDataItem(group, key, rawValue) {
  if (!USER_ADDABLE_LISTS.has(key) || group !== 'seeker') {
    const error = new Error('This list does not accept suggested additions');
    error.status = 403;
    error.code = 'REFERENCE_ITEM_NOT_ADDABLE';
    throw error;
  }

  await seedReferenceDataIfNeeded();
  const list = await backfillReferenceList(group, key);
  if (!list) return null;

  const value = ensureUsableLabel(rawValue);
  const match = findReferenceMatches(list, value);

  if (match.kind === 'exact' || match.kind === 'alias') {
    return { action: 'use_existing', item: match.item, created: false, aliased: match.kind === 'alias' };
  }
  if (match.kind === 'similar') {
    return { action: 'similar', matches: match.matches, created: false };
  }

  const updated = await ReferenceDataList.findOneAndUpdate(
    { group, key, normalizedItems: { $nin: [match.normalized] } },
    { $push: { items: value, normalizedItems: match.normalized } },
    { new: true },
  );

  if (!updated) {
    const retry = await backfillReferenceList(group, key);
    const retryMatch = retry ? findReferenceMatches(retry, value) : null;
    if (retryMatch?.kind === 'exact' || retryMatch?.kind === 'alias') {
      return { action: 'use_existing', item: retryMatch.item, created: false, aliased: retryMatch.kind === 'alias' };
    }
    if (retryMatch?.kind === 'similar') {
      return { action: 'similar', matches: retryMatch.matches, created: false };
    }
    throw new Error('Reference list changed while adding the suggestion');
  }

  return { action: 'created', item: value, created: true };
}

export async function addReferenceDataAlias(group, key, rawAlias, rawItem) {
  if (!USER_ADDABLE_LISTS.has(key) || group !== 'seeker') {
    const error = new Error('This list does not accept user aliases');
    error.status = 403;
    error.code = 'REFERENCE_ITEM_NOT_ADDABLE';
    throw error;
  }

  await seedReferenceDataIfNeeded();
  const list = await backfillReferenceList(group, key);
  if (!list) return null;

  const alias = ensureUsableLabel(rawAlias);
  const normalized = normalizeReferenceValue(alias);
  const itemMatch = findReferenceMatches(list, rawItem);
  if (!itemMatch || !('item' in itemMatch) || !itemMatch.item) {
    const error = new Error('Choose an item already in the list before saving an alias');
    error.status = 400;
    error.code = 'REFERENCE_ALIAS_TARGET_MISSING';
    throw error;
  }

  const item = itemMatch.item;
  const existingAlias = (list.aliases ?? []).find((entry) => entry.normalized === normalized);
  if (existingAlias?.item === item) return { action: 'aliased', item, alias: existingAlias.alias, created: false };
  if (existingAlias?.item && existingAlias.item !== item) {
    const error = new Error(`That alias already belongs to "${existingAlias.item}"`);
    error.status = 409;
    error.code = 'REFERENCE_ALIAS_CONFLICT';
    throw error;
  }

  const exactItem = (list.items ?? []).find((entry) => normalizeReferenceValue(entry) === normalized);
  if (exactItem) return { action: 'use_existing', item: exactItem, created: false, aliased: false };

  const updated = await ReferenceDataList.findOneAndUpdate(
    { group, key, 'aliases.normalized': { $ne: normalized } },
    { $push: { aliases: { alias, normalized, item, source: 'user' } } },
    { new: true },
  );

  if (!updated) {
    const retry = await backfillReferenceList(group, key);
    const retryAlias = retry?.aliases?.find((entry) => entry.normalized === normalized);
    if (retryAlias?.item === item) return { action: 'aliased', item, alias: retryAlias.alias, created: false };
    const conflict = retryAlias?.item ? `"${retryAlias.alias}" already belongs to "${retryAlias.item}"` : 'Alias changed while saving';
    const error = new Error(conflict);
    error.status = 409;
    error.code = 'REFERENCE_ALIAS_CONFLICT';
    throw error;
  }

  return { action: 'aliased', item, alias, created: true };
}

/**
 * Ensures reference data lists exist in MongoDB.
 * Inserts any missing default lists without overwriting customized lists.
 */
export async function seedReferenceDataIfNeeded() {
  const count = await ReferenceDataList.countDocuments();
  if (count > 0) {
    const existing = await ReferenceDataList.find({}).select('group key').lean();
    for (const { group, key } of existing) await backfillReferenceList(group, key);
    return;
  }

  const ops = [];
  for (const group of DEFAULT_REFERENCE_GROUPS) {
    for (const list of group.lists) {
      const aliases = (DEFAULT_REFERENCE_ALIASES[group.key]?.[list.key] ?? [])
        .filter((entry) => list.items.includes(entry.item))
        .map((entry) => ({
          ...entry,
          normalized: normalizeReferenceValue(entry.alias),
          source: 'seed',
        }));
      ops.push({
        group: group.key,
        key: list.key,
        label: list.label,
        singular: list.singular,
        items: [...list.items],
        normalizedItems: list.items.map(normalizeReferenceValue),
        aliases,
      });
    }
  }

  if (ops.length > 0) {
    try {
      await ReferenceDataList.insertMany(ops, { ordered: false });
    } catch {
      // Ignore duplicate key errors in race conditions
    }
  }
}

/**
 * Gets all reference data groups with lists from DB, falling back to defaults if not yet seeded.
 */
export async function getReferenceDataGroups(filterGroup = null) {
  await seedReferenceDataIfNeeded();

  const query = filterGroup ? { group: filterGroup } : {};
  const stored = await ReferenceDataList.find(query).lean();
  const storedMap = new Map(stored.map((doc) => [`${doc.group}:${doc.key}`, doc]));

  const groups = DEFAULT_REFERENCE_GROUPS.filter((g) => !filterGroup || g.key === filterGroup);

  return groups.map((g) => {
    const lists = g.lists.map((defaultList) => {
      const match = storedMap.get(`${g.key}:${defaultList.key}`);
      return {
        key: defaultList.key,
        label: match?.label || defaultList.label,
        singular: match?.singular || defaultList.singular,
        items: match?.items || defaultList.items,
        updatedAt: match?.updatedAt || null,
      };
    });

    return {
      key: g.key,
      label: g.label,
      description: g.description,
      lists,
    };
  });
}

/**
 * Gets a single list by group and key.
 */
export async function getReferenceDataList(group, key) {
  await seedReferenceDataIfNeeded();

  let found = await ReferenceDataList.findOne({ group, key }).lean();
  if (!found) {
    const groupDef = DEFAULT_REFERENCE_GROUPS.find((g) => g.key === group);
    const listDef = groupDef?.lists.find((l) => l.key === key);
    if (!listDef) return null;

    found = {
      group,
      key,
      label: listDef.label,
      singular: listDef.singular,
      items: listDef.items,
    };
  }

  return found;
}

/**
 * Upserts a reference data list.
 */
export async function updateReferenceDataList(group, key, items, updatedBy = null, extra = {}) {
  await seedReferenceDataIfNeeded();

  const groupDef = DEFAULT_REFERENCE_GROUPS.find((g) => g.key === group);
  const listDef = groupDef?.lists.find((l) => l.key === key);

  const label = extra.label || listDef?.label || key;
  const singular = extra.singular || listDef?.singular || key;

  const cleanedItems = [];
  const normalizedItems = [];
  const seen = new Set();

  for (const rawItem of items) {
    const cleaned = ensureUsableLabel(rawItem);
    const normalized = normalizeReferenceValue(cleaned);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    cleanedItems.push(cleaned);
    normalizedItems.push(normalized);
  }

  const existing = await ReferenceDataList.findOne({ group, key }).lean();
  const existingAliases = Array.isArray(existing?.aliases) ? existing.aliases : [];
  const aliases = existingAliases
    .map((alias) => {
      const normalizedAlias = normalizeReferenceValue(alias.alias ?? '');
      const normalizedItem = normalizeReferenceValue(alias.item ?? '');
      const canonicalIndex = normalizedItems.findIndex((candidate) => candidate === normalizedItem);
      return canonicalIndex === -1 ? null : { ...alias, normalized: normalizedAlias, item: cleanedItems[canonicalIndex] };
    })
    .filter(Boolean);

  const defaults = DEFAULT_REFERENCE_ALIASES[group]?.[key] ?? [];
  const aliasNormals = new Set(aliases.map((alias) => alias.normalized));
  for (const entry of defaults) {
    const normalizedItem = normalizeReferenceValue(entry.item);
    const canonicalIndex = normalizedItems.findIndex((candidate) => candidate === normalizedItem);
    const normalizedAlias = normalizeReferenceValue(entry.alias);
    if (canonicalIndex !== -1 && !aliasNormals.has(normalizedAlias)) {
      aliases.push({ ...entry, normalized: normalizedAlias, item: cleanedItems[canonicalIndex], source: 'seed' });
      aliasNormals.add(normalizedAlias);
    }
  }

  const doc = await ReferenceDataList.findOneAndUpdate(
    { group, key },
    {
      $set: {
        items: cleanedItems,
        normalizedItems,
        aliases,
        label,
        singular,
        ...(updatedBy ? { updatedBy } : {}),
      },
    },
    { new: true, upsert: true }
  );

  return doc;
}
