/**
 * Mock data for the Opportunities queue.
 * Mirrors PostedOpportunity from kredibble-app/src/constants/authStore.ts,
 * plus a `moderationStatus` field the mobile app doesn't have yet — that
 * state only needs to exist on the admin side.
 */

import type { PostingHirerRecord } from './api';

export type OpportunityType = 'jobs' | 'internships' | 'events' | 'grants';
export type ModerationStatus = 'pending' | 'approved' | 'rejected';

export interface PostedOpportunity {
  id: string;
  title: string;
  type: OpportunityType;
  company: string;
  location: string;
  description: string;
  applicantsCount: number;
  date: string;
  moderationStatus: ModerationStatus;
  workType?: string;
  salary?: string;
  eventDateTime?: string;
  eventCategory?: string;
  grantBudgetRange?: string;
  grantSector?: string;
  /** SEC-151: what the review page needs to decide: when it closes, where people apply, who posted it. */
  deadline?: string;
  applyUrl?: string;
  hirer?: PostingHirerRecord | null;
  /** SEC-151: set while rejected (a code from REJECTION_REASONS, the note for the hirer, when). */
  rejectionReason?: string;
  rejectionNote?: string;
  rejectedAt?: string;
}

const WAVE: PostingHirerRecord = {
  accountId: 'hirer-wave',
  userId: 'user-wave',
  companyName: 'Wave Mobile Money',
  recruiterName: 'Aminata Diop',
  email: 'talent@wave-mobile.example',
  phone: '+221 77 000 0000',
  verificationStatus: 'verified',
};
const GOOGLE: PostingHirerRecord = {
  accountId: 'hirer-google',
  userId: 'user-google',
  companyName: 'Google LLC',
  recruiterName: 'Kofi Boateng',
  email: 'ghana-hiring@google.example',
  verificationStatus: 'verified',
};
const ASHESI: PostingHirerRecord = {
  accountId: 'hirer-ashesi',
  userId: 'user-ashesi',
  companyName: 'Ashesi Ventures',
  recruiterName: 'Efua Mensah',
  email: 'ventures@ashesi.example',
  verificationStatus: 'pending',
};
const KANZU: PostingHirerRecord = {
  accountId: 'hirer-kanzu',
  userId: 'user-kanzu',
  companyName: 'Kanzu Code',
  email: 'jobs@kanzucode.example',
  verificationStatus: 'not_submitted',
};

export const postedOpportunities: PostedOpportunity[] = [
  {
    id: 'opp-1',
    title: 'Senior Product Designer',
    type: 'jobs',
    company: 'Google LLC',
    location: 'Accra, Ghana (Hybrid)',
    description:
      'We are looking for a Senior Product Designer to lead design initiatives across the Google Pay EMEA teams. You will work on expanding digital payment experiences for millions of users.',
    applicantsCount: 3,
    date: '28 Jun 2026',
    moderationStatus: 'approved',
    workType: 'Hybrid',
    salary: '$85,000 – $110,000/yr',
    deadline: '2026-08-31',
    applyUrl: 'https://careers.google.example/jobs/senior-product-designer',
    hirer: GOOGLE,
  },
  {
    id: 'opp-2',
    title: 'UX Research Intern',
    type: 'internships',
    company: 'Google LLC',
    location: 'Accra, Ghana (On-site)',
    description:
      'A 6-month internship focusing on gathering qualitative insights, structuring user journeys, and conducting usability tests for new localization features in West Africa.',
    applicantsCount: 2,
    date: '29 Jun 2026',
    moderationStatus: 'approved',
    workType: 'On-site',
    deadline: '2026-09-15',
    applyUrl: 'https://careers.google.example/jobs/ux-research-intern',
    hirer: GOOGLE,
  },
  {
    id: 'opp-3',
    title: 'Backend Engineer, Payments',
    type: 'jobs',
    company: 'Wave Mobile Money',
    location: 'Dakar, Senegal (Remote)',
    description:
      'Join Wave to build resilient payment infrastructure serving millions of unbanked users across West Africa. Strong Go and distributed systems experience required.',
    applicantsCount: 12,
    date: '10 Jul 2026',
    moderationStatus: 'pending',
    workType: 'Remote',
    salary: '$60,000 – $90,000/yr',
    deadline: '2026-12-15',
    applyUrl: 'https://wave-mobile.example/careers/backend-engineer-payments',
    hirer: WAVE,
  },
  {
    id: 'opp-4',
    title: 'Founders & Funders Demo Night',
    type: 'events',
    company: 'Ashesi Ventures',
    location: 'Berekuso, Ghana',
    description:
      'An evening of pitches from Ashesi-affiliated founders in front of regional investors, followed by a networking mixer. Open to students, alumni, and the public.',
    applicantsCount: 46,
    date: '2 Aug 2026',
    moderationStatus: 'pending',
    eventDateTime: '2 Aug 2026, 6:00 PM GMT',
    eventCategory: 'Networking',
    hirer: ASHESI,
  },
  {
    id: 'opp-5',
    title: 'Early-Stage EdTech Innovation Grant',
    type: 'grants',
    company: 'Ashesi Ventures',
    location: 'Pan-African',
    description:
      'Non-dilutive funding for early-stage EdTech founders building for the African market. Grants of up to $25,000 plus a 3-month mentorship track.',
    applicantsCount: 8,
    date: '5 Jul 2026',
    moderationStatus: 'pending',
    grantBudgetRange: 'Up to $25,000',
    grantSector: 'Education',
    deadline: '2026-10-01',
    applyUrl: 'https://ventures.ashesi.example/edtech-grant',
    hirer: ASHESI,
  },
  {
    id: 'opp-6',
    title: 'Remote React Native Contractor',
    type: 'jobs',
    company: 'Kanzu Code',
    location: 'Kampala, Uganda (Remote)',
    description:
      'Short-term contract (3 months) building a cross-platform companion app. Fast turnaround expected — 90-day rolling budget with possible extension.',
    applicantsCount: 5,
    date: '15 Jul 2026',
    moderationStatus: 'rejected',
    workType: 'Contract',
    salary: '$3,000/mo',
    hirer: KANZU,
    rejectionReason: 'incomplete',
    rejectionNote: 'Add how to apply and what the 90-day budget covers.',
    rejectedAt: '2026-07-16T10:00:00.000Z',
  },
];
