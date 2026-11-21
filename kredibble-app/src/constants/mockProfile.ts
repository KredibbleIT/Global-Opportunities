import { mockExperts, Expert } from './mockExperts';
import { authStore } from './authStore';
import { toggleSavedItem } from '../lib/api';

export interface SavedOpportunity {
  id: string;
  type: 'jobs' | 'internships' | 'events' | 'grants';
}

export interface Application {
  id: string;
  opportunityId: string;
  type: 'jobs' | 'internships';
  title: string;
  company: string;
  description: string;
  appliedDate: string;
  status: 'In review' | 'Interview' | 'Rejected';
}

export interface NotificationSettings {
  // Jobs
  jobAlerts: boolean;
  aiRecommendations: boolean;
  jobActivity: boolean;
  savedJobs: boolean;
  // Application Updates
  statusUpdates: boolean;
  interviewInvites: boolean;
  // Community
  newPosts: boolean;
  // Recruiter
  recruiterViews: boolean;
  // Marketing
  marketingUpdates: boolean;
  pushNotifications: boolean;
}

export interface SecuritySettings {
  showProfileToRecruiters: boolean;
}

/** A profile with nothing filled in yet. Never sample data: a new person sees only what they have entered themselves. */
const blankProfile = (): Expert => ({
  id: '',
  name: '',
  profession: '',
  verified: false,
  website: '',
  location: '',
  country: '',
  city: '',
  email: '',
  phone: '',
  rating: 0,
  image: '',
  bio: '',
  professionalSummary: '',
  technicalSkills: [],
  softSkills: [],
  workExperience: [],
  education: [],
  projects: [],
  certifications: [],
  tools: [],
  experienceLevel: 'Entry Level',
});

/** The server keeps skill lists as JSON text; this reads either that or a real array. */
const toList = (value: unknown): string[] => {
  let list: unknown = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
};

/** A list of objects kept as JSON text (or a real array) on the server: education, work experience, projects. Anything malformed is dropped. */
const toEntries = <T>(value: unknown, isEntry: (entry: Record<string, unknown>) => T | null): T[] => {
  let list: unknown = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map(isEntry)
    .filter((entry): entry is T => entry !== null);
};

const str = (value: unknown) => (typeof value === 'string' ? value : '');

class ProfileStateStore {
  /** The signed-in seeker's own profile (see syncFromAuth). Blank when nobody is signed in. */
  user: Expert = blankProfile();
  saved: SavedOpportunity[] = [];
  applications: Application[] = [
    {
      id: 'app-1',
      opportunityId: '1',
      type: 'jobs',
      title: 'Senior Product designer',
      company: 'Wave mobile money',
      description: 'In 2017, over half the population in Sub-Saharan Africa had no bank account...',
      appliedDate: '24 May 2026',
      status: 'In review'
    },
    {
      id: 'app-2',
      opportunityId: '2',
      type: 'jobs',
      title: 'Junior Product designer',
      company: 'Pinterest',
      description: 'A curious and detail-oriented Junior Product Designer with strong visual design skills...',
      appliedDate: '20 May 2026',
      status: 'Interview'
    },
    {
      id: 'app-3',
      opportunityId: '3',
      type: 'jobs',
      title: 'Junior Product designer',
      company: 'OpenSea',
      description: 'A curious and detail-oriented Junior Product Designer with strong visual design skills...',
      appliedDate: '15 May 2026',
      status: 'Rejected'
    },
    {
      id: 'app-4',
      opportunityId: '3',
      type: 'internships',
      title: 'Junior Product designer',
      company: 'OpenSea',
      description: 'A curious and detail-oriented Junior Product Designer with strong visual design skills...',
      appliedDate: '18 May 2026',
      status: 'In review'
    }
  ];

  notifications: NotificationSettings = {
    jobAlerts: true,
    aiRecommendations: true,
    jobActivity: false,
    savedJobs: true,
    statusUpdates: true,
    interviewInvites: true,
    newPosts: true,
    recruiterViews: true,
    marketingUpdates: false,
    pushNotifications: true
  };

  security: SecuritySettings = {
    showProfileToRecruiters: true
  };

  private listeners: (() => void)[] = [];

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(l => l());
  }

  /**
   * Builds the profile from the signed-in person: the name and email on the account plus what the server holds for their seeker profile.
   * Everything shown comes from the server, so it is the same on every phone. It is cleared when someone else signs in or the person signs
   * out, so nobody sees another person's (or sample) details.
   */
  syncFromAuth() {
    const account = authStore.user;
    if (!account || account.role !== 'seeker') {
      if (this.user.id) {
        this.user = blankProfile();
        this.saved = [];
        this.notify();
      }
      return;
    }
    const seeker = (account.seeker ?? {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' ? value : '');
    const kept = this.user.id === account.id ? this.user : blankProfile();
    const seekerLists = {
      education: toEntries(seeker.education, (e) => ({ degree: str(e.degree), institution: str(e.institution), duration: str(e.duration) })),
      workExperience: toEntries(seeker.workExperience, (e) => ({ role: str(e.role), company: str(e.company), location: str(e.location), duration: str(e.duration), bullets: toList(e.bullets) })),
      projects: toEntries(seeker.projects, (e) => ({ name: str(e.name), bullets: toList(e.bullets) })),
    };
    const city = text(seeker.city);
    const country = text(seeker.country);
    this.user = {
      ...kept,
      id: account.id,
      name: account.name,
      email: account.email,
      profession: text(seeker.profession),
      phone: text(seeker.phone),
      city,
      country,
      location: [city, country].filter(Boolean).join(', '),
      verified: seeker.verified === true,
      rating: typeof seeker.rating === 'number' ? seeker.rating : 0,
      bio: text(seeker.bio),
      professionalSummary: text(seeker.professionalSummary),
      technicalSkills: toList(seeker.technicalSkills),
      softSkills: toList(seeker.softSkills),
      tools: toList(seeker.tools),
      certifications: toList(seeker.certifications),
      ...seekerLists,
      resumeUrl: str(seeker.resumeUrl) || undefined,
      image: account.avatarUrl ?? '',
    };
    this.notify();
  }

  updateProfile(updatedUser: Partial<Expert>) {
    this.user = { ...this.user, ...updatedUser };
    // Synchronize to the shared mockExperts array so changes reflect elsewhere too
    const index = mockExperts.findIndex(e => e.id === this.user.id);
    if (index !== -1) {
      mockExperts[index] = this.user;
    }
    this.notify();
  }

  toggleSaved(id: string, type: 'jobs' | 'internships' | 'events' | 'grants') {
    const exists = this.saved.some(item => item.id === id && item.type === type);
    if (exists) {
      this.saved = this.saved.filter(item => !(item.id === id && item.type === type));
    } else {
      this.saved.push({ id, type });
    }
    this.notify();

    try {
      const userId = authStore.user?.id;
      if (userId) {
        const itemType = type === 'jobs' ? 'opportunities' : type;
        toggleSavedItem({ itemId: id, itemType }).catch((_err: any) => {
          console.warn('Failed to persist bookmark to server');
        });
      }
    } catch {
      console.warn('Could not load auth store for saving item');
    }
  }

  isSaved(id: string, type: 'jobs' | 'internships' | 'events' | 'grants'): boolean {
    return this.saved.some(item => item.id === id && item.type === type);
  }

  updateNotifications(settings: Partial<NotificationSettings>) {
    this.notifications = { ...this.notifications, ...settings };
    this.notify();
  }

  updateSecurity(settings: Partial<SecuritySettings>) {
    this.security = { ...this.security, ...settings };
    this.notify();
  }

  deleteAccount() {
    console.log('Account deleted successfully');
    // Implement state reset or navigation behavior if needed
  }

  logout() {
    console.log('Logged out of account successfully');
  }
}

export const profileStore = new ProfileStateStore();

// Follow the signed-in person: sign-in, a refreshed profile, a new picture and sign-out all update the profile screens.
authStore.subscribe(() => profileStore.syncFromAuth());
profileStore.syncFromAuth();
