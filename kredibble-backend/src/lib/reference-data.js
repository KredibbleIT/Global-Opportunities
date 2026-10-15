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

/**
 * Ensures reference data lists exist in MongoDB.
 * Inserts any missing default lists without overwriting customized lists.
 */
export async function seedReferenceDataIfNeeded() {
  const count = await ReferenceDataList.countDocuments();
  if (count > 0) return;

  const ops = [];
  for (const group of DEFAULT_REFERENCE_GROUPS) {
    for (const list of group.lists) {
      ops.push({
        group: group.key,
        key: list.key,
        label: list.label,
        singular: list.singular,
        items: [...list.items],
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

  const doc = await ReferenceDataList.findOneAndUpdate(
    { group, key },
    {
      $set: {
        items: Array.from(new Set(items.map((i) => i.trim()).filter(Boolean))),
        label,
        singular,
        ...(updatedBy ? { updatedBy } : {}),
      },
    },
    { new: true, upsert: true }
  );

  return doc;
}
