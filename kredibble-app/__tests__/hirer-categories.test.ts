import { CREATE_TYPE, OPPORTUNITY_CATEGORIES, categoryOfApiType } from '../src/constants/opportunityCategories';

// The hirer's posts and the Post form use the same eight categories as the admin's Opportunities queue. ALL DATA IS FAKE.

describe('the eight categories', () => {
  it('are the admin\'s, in the admin\'s order and with its names', () => {
    expect(OPPORTUNITY_CATEGORIES.map((category) => category.title)).toEqual([
      'Events & Competitions',
      'Volunteerism & Community Service',
      'Awards, Grants & Funding',
      'Jobs & Internships',
      'Scholarships',
      'Fellowships & Exchange Programmes',
      'Training & Workshops',
      'Mentorship & Career Development',
    ]);
  });

  it('place every stored spelling of a type in its category', () => {
    const expected: Record<string, string> = {
      event: 'events', events: 'events', competition: 'events', competitions: 'events',
      volunteer: 'volunteer', volunteers: 'volunteer',
      grant: 'funding', grants: 'funding',
      job: 'jobs', jobs: 'jobs', internship: 'jobs', internships: 'jobs',
      scholarship: 'scholarships', scholarships: 'scholarships',
      fellowship: 'fellowships', fellowships: 'fellowships',
      training: 'training', trainings: 'training', 'training-workshop': 'training',
      mentorship: 'mentorship', mentorships: 'mentorship',
    };
    for (const [type, key] of Object.entries(expected)) expect(categoryOfApiType(type)?.key).toBe(key);
    expect(categoryOfApiType('JOBS')?.key).toBe('jobs');
    expect(categoryOfApiType('lottery')).toBeUndefined();
    expect(categoryOfApiType(undefined)).toBeUndefined();
  });

  it('save a new listing with a type that belongs to the category it was posted in', () => {
    for (const category of OPPORTUNITY_CATEGORIES) expect(categoryOfApiType(CREATE_TYPE[category.key])?.key).toBe(category.key);
    expect(Object.keys(CREATE_TYPE).sort()).toEqual(OPPORTUNITY_CATEGORIES.map((category) => category.key).sort());
  });
});
