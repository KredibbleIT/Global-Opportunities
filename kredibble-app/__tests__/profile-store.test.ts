import { authStore } from '../src/constants/authStore';
import { profileStore } from '../src/constants/mockProfile';

// Manage profile shows the signed-in person's own details, never sample data. ALL DATA IS FAKE.

const newSeeker = {
  id: 'user-new-1',
  name: 'Test Newcomer',
  email: 'test.newcomer@example.com',
  role: 'seeker',
  seeker: { profession: 'Data Analyst', city: 'Lagos', country: 'Nigeria', phone: '+2340000000', technicalSkills: '["SQL","Excel"]', rating: 0, verified: false },
};

describe('profile store follows the signed-in person', () => {
  afterEach(() => authStore.clearSession());

  it('shows only the new person\'s details, with no sample profile left over', () => {
    authStore.setSession('token', newSeeker);
    const profile = profileStore.user;
    expect(profile).toMatchObject({
      id: 'user-new-1',
      name: 'Test Newcomer',
      email: 'test.newcomer@example.com',
      profession: 'Data Analyst',
      location: 'Lagos, Nigeria',
      phone: '+2340000000',
      technicalSkills: ['SQL', 'Excel'],
      verified: false,
      rating: 0,
      image: '',
    });
    expect(profile.softSkills).toEqual([]);
    expect(profile.workExperience).toEqual([]);
    expect(profile.projects).toEqual([]);
    expect(profile.certifications).toEqual([]);
    expect(profile.tools).toEqual([]);
    expect(profile.website).toBe('');
    expect(profile.professionalSummary).toBe('');
  });

  it('shows the education, work history and projects the server holds, and drops them when someone else signs in', () => {
    const saved = {
      ...newSeeker,
      seeker: {
        ...newSeeker.seeker,
        education: '[{"degree":"BSc Statistics","institution":"Test University","duration":"2026"}]',
        workExperience: '[{"role":"Intern","company":"Test Co","location":"Accra","duration":"2025","bullets":["Built reports"]}]',
        projects: [{ name: 'Test Project', bullets: ['Did a thing'] }],
        resumeUrl: 'https://example.com/uploads/cv.pdf',
      },
    };
    authStore.setSession('token', saved);
    expect(profileStore.user.education).toEqual([{ degree: 'BSc Statistics', institution: 'Test University', duration: '2026' }]);
    expect(profileStore.user.workExperience).toEqual([{ role: 'Intern', company: 'Test Co', location: 'Accra', duration: '2025', bullets: ['Built reports'] }]);
    expect(profileStore.user.projects).toEqual([{ name: 'Test Project', bullets: ['Did a thing'] }]);
    expect(profileStore.user.resumeUrl).toBe('https://example.com/uploads/cv.pdf');

    // A refresh with changed details replaces what was shown.
    authStore.setSession('token', { ...saved, seeker: { ...saved.seeker, profession: 'Analyst', education: '[]' } });
    expect(profileStore.user.profession).toBe('Analyst');
    expect(profileStore.user.education).toEqual([]);

    authStore.setSession('token', { ...saved, id: 'user-new-2', name: 'Test Other', email: 'test.other@example.com', seeker: { profession: 'Designer' } });
    expect(profileStore.user.name).toBe('Test Other');
    expect(profileStore.user.education).toEqual([]);
    expect(profileStore.user.resumeUrl).toBeUndefined();
  });

  it('ignores malformed saved lists instead of failing', () => {
    authStore.setSession('token', { ...newSeeker, seeker: { ...newSeeker.seeker, education: 'not json', workExperience: '{"a":1}', projects: [null, 5, { name: 'Ok' }] } });
    expect(profileStore.user.education).toEqual([]);
    expect(profileStore.user.workExperience).toEqual([]);
    expect(profileStore.user.projects).toEqual([{ name: 'Ok', bullets: [] }]);
  });

  it('shows the picture the person set, and clears everything on sign-out', () => {
    authStore.setSession('token', newSeeker);
    authStore.setAvatar('https://example.com/uploads/me.png');
    expect(profileStore.user.image).toBe('https://example.com/uploads/me.png');
    authStore.clearSession();
    expect(profileStore.user.id).toBe('');
    expect(profileStore.user.name).toBe('');
  });
});
