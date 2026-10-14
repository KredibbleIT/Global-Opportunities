/**
 * Demo Seed Module for Kredibble Admin & End-to-End Testing (BE-020)
 *
 * Populates a MongoDB instance with comprehensive, deterministic sample data
 * matching the exact shape of kredibble-admin/src/lib/mock-seed.ts.
 *
 * Covers:
 * - 13 Staff members representing all 12 platform roles with active User accounts
 * - 14 Curated opportunities / listings with view and application metrics
 * - 12 Programs across planned, running, delivered, and cancelled states
 * - 18 Partners with six-stage pipeline histories and assigned owners
 * - 40 Ambassadors with referral codes, campus locations, tiers, and amplification logs
 * - 120 Beneficiary database records across 5 sources with verified timestamps
 * - 60 Social posts across 6 platforms with reach and engagement metrics
 * - 9 Testimonials with approved, pending, and rejected moderation states
 * - 6 Months of website audience traffic rollups with channel breakdowns
 * - Historical KPI targets and status thresholds with immutable audit changes
 * - Past monthly report logs
 * - Centralized reference data taxonomies
 */
import bcrypt from 'bcryptjs';
import {
  Program,
  Partner,
  Ambassador,
  AmbassadorAmplification,
  Beneficiary,
  SocialPost,
  Testimonial,
  MonthlyReport,
  WebsiteMonth,
  TargetChange,
  ThresholdChange,
} from '../models/AdminPortal.js';
import { User, StaffMember } from '../models/User.js';
import { Opportunity } from '../models/Platform.js';
import { seedReferenceDataIfNeeded } from './reference-data.js';

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Kwame', 'Ama', 'Kofi', 'Abena', 'Yaw', 'Efua', 'Kwabena', 'Akosua', 'Kojo', 'Adwoa', 'Nana', 'Esi', 'Kwesi', 'Afia', 'Yaa', 'Kobby',
  'Chidi', 'Ngozi', 'Tunde', 'Folake', 'Emeka', 'Zainab', 'Segun', 'Amaka', 'Ifeanyi', 'Bisi', 'Obinna', 'Chiamaka', 'Musa', 'Halima',
  'Fatou', 'Aminata', 'Moussa', 'Mariam', 'Seydou', 'Awa', 'Ibrahim', 'Isatu', 'Mohamed', 'Hawa', 'Wanjiru', 'Otieno', 'Akello', 'Mugisha',
  'Nakato', 'Kiprono', 'Amina', 'Jelani', 'Thandi', 'Sipho', 'Naledi', 'Tendai', 'Rudo', 'Kagiso', 'Imani', 'Baraka', 'Neema', 'Juma',
];

const LAST_NAMES = [
  'Mensah', 'Owusu', 'Boateng', 'Asante', 'Appiah', 'Adjei', 'Darko', 'Osei', 'Bonsu', 'Tetteh', 'Agyeman', 'Frimpong', 'Quaye', 'Amoah',
  'Okafor', 'Eze', 'Adeyemi', 'Balogun', 'Nwosu', 'Bello', 'Ojo', 'Okonkwo', 'Abubakar', 'Adebayo', 'Ndiaye', 'Sow', 'Traore', 'Keita',
  'Coulibaly', 'Conteh', 'Kamara', 'Sesay', 'Kariuki', 'Otieno', 'Mwangi', 'Nakamya', 'Ssemakula', 'Mukasa', 'Niyonzima', 'Habimana',
];

const CAMPUSES = [
  { name: 'KNUST', country: 'Ghana' },
  { name: 'University of Ghana', country: 'Ghana' },
  { name: 'Ashesi University', country: 'Ghana' },
  { name: 'UCC', country: 'Ghana' },
  { name: 'University of Lagos', country: 'Nigeria' },
  { name: 'Covenant University', country: 'Nigeria' },
  { name: 'Makerere University', country: 'Uganda' },
  { name: 'University of Nairobi', country: 'Kenya' },
  { name: 'UCAD', country: 'Senegal' },
  { name: 'Fourah Bay College', country: 'Sierra Leone' },
];

const CAMPUS_CITY = {
  KNUST: 'Kumasi',
  'University of Ghana': 'Accra',
  'Ashesi University': 'Berekuso',
  UCC: 'Cape Coast',
  'University of Lagos': 'Lagos',
  'Covenant University': 'Ota',
  'Makerere University': 'Kampala',
  'University of Nairobi': 'Nairobi',
  UCAD: 'Dakar',
  'Fourah Bay College': 'Freetown',
};

const DIAL_CODE = {
  Ghana: '+233',
  Nigeria: '+234',
  Uganda: '+256',
  Kenya: '+254',
  Senegal: '+221',
  'Sierra Leone': '+232',
};

const fullName = (index, shift = 0) => {
  const first = FIRST_NAMES[(index + shift) % FIRST_NAMES.length];
  const last = LAST_NAMES[(index * 7 + 3 + shift * 5) % LAST_NAMES.length];
  return `${first} ${last}`;
};

const emailOf = (name, domain = 'kredibble.com') =>
  `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${domain}`;

export const DEFAULT_TARGETS = {
  opportunities_published: 2,
  programs_organised: 1,
  active_ambassadors: 21,
  partners_onboarded: 4,
  beneficiaries_verified: 15,
  social_reach: 10500,
  social_engagement: 800,
  posts_published: 8,
  website_views: 12000,
  monthly_reports: 1,
};

export const DEFAULT_THRESHOLDS = { green: 95, amber: 70 };

export async function seedDemoData(options = {}) {
  const today = options.today ? new Date(options.today) : new Date();
  const todayIso = isoDate(today);
  const elapsed = today.getUTCDate();
  const rand = mulberry32(20260301);
  const between = (low, high) => low + Math.floor(rand() * (high - low + 1));

  const monthStart = (ago) =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - ago, 1));
  const daysIn = (ago) => {
    const start = monthStart(ago);
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  };
  const dayIn = (ago, fraction) => {
    const available = ago === 0 ? elapsed : daysIn(ago);
    const day = 1 + Math.min(available - 1, Math.floor(fraction * available));
    return isoDate(
      new Date(Date.UTC(monthStart(ago).getUTCFullYear(), monthStart(ago).getUTCMonth(), day))
    );
  };
  const monthKey = (ago) =>
    `${monthStart(ago).getUTCFullYear()}-${pad(monthStart(ago).getUTCMonth() + 1)}`;
  const clamp = (iso) => (iso > todayIso ? todayIso : iso);

  await seedReferenceDataIfNeeded();

  let adminUser = options.adminUser;
  if (!adminUser) {
    adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'E2E Admin',
        email: process.env.E2E_ADMIN_EMAIL || 'test-admin@kredibble.com',
        role: 'admin',
        emailVerified: true,
        passwordHash: await bcrypt.hash(process.env.E2E_ADMIN_PASSWORD || 'Password123', 12),
      });
    }
  }

  const existingStaffAdmin = await StaffMember.findOne({ userId: adminUser._id });
  if (!existingStaffAdmin) {
    await StaffMember.create({
      userId: adminUser._id,
      name: adminUser.name || 'E2E Admin',
      email: adminUser.email,
      roles: ['super_admin', 'desk_lead'],
      status: 'active',
      title: 'Super Admin & Desk Lead',
      country: 'Ghana',
      joinedDate: '2026-01-01',
    });
  }

  // 1. Staff Members & Linked User Accounts (12 roles represented)
  const staffSpecs = [
    { name: 'Nana Adjei', title: 'Super Admin', country: 'Ghana', roles: ['super_admin'], joinedDate: '2026-01-01' },
    { name: 'Efua Mensimah', title: 'Moderator', country: 'Ghana', roles: ['moderator'], joinedDate: '2026-03-15' },
    { name: 'Yaw Antwi', title: 'Support', country: 'Ghana', roles: ['support'], joinedDate: '2026-06-02' },
    { name: 'Esi Mensah-Owusu', title: 'Desk Lead', country: 'Ghana', roles: ['desk_lead'], joinedDate: addDays(todayIso, -240) },
    { name: 'Kojo Appiah', title: 'Partnerships Officer', country: 'Ghana', roles: ['partnerships_officer'], joinedDate: addDays(todayIso, -222) },
    { name: 'Adaeze Okonkwo', title: 'Opportunities and Communications Officer', country: 'Nigeria', roles: ['opportunities_officer', 'communications_officer'], joinedDate: addDays(todayIso, -204) },
    { name: 'Kwabena Tetteh', title: 'Training Officer and Ghana Lead', country: 'Ghana', roles: ['training_officer', 'country_lead'], joinedDate: addDays(todayIso, -186) },
    { name: 'Nana Yaa Boateng', title: 'Database Officer', country: 'Ghana', roles: ['database_officer'], joinedDate: addDays(todayIso, -168) },
    { name: 'Fatou Ndiaye', title: 'Communications Officer', country: 'Senegal', roles: ['communications_officer'], joinedDate: addDays(todayIso, -150) },
    { name: 'Samuel Kiprono', title: 'Social Media Manager', country: 'Kenya', roles: ['social_media_manager'], joinedDate: addDays(todayIso, -132) },
    { name: 'Amara Kamara', title: 'Sierra Leone Lead and Partnerships Officer', country: 'Sierra Leone', roles: ['country_lead', 'partnerships_officer'], joinedDate: addDays(todayIso, -114) },
    { name: 'Chioma Eze', title: 'Social Media and Training Assistant', country: 'Nigeria', roles: ['social_media_manager', 'training_officer'], joinedDate: addDays(todayIso, -96) },
    { name: 'Yaw Frimpong', title: 'Admin Support', country: 'Ghana', roles: ['admin_support'], joinedDate: addDays(todayIso, -78) },
  ];

  const defaultPasswordHash = await bcrypt.hash('Password123', 12);
  const staffDocs = [];

  for (const spec of staffSpecs) {
    const email = emailOf(spec.name);
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: spec.name,
        email,
        role: 'admin',
        emailVerified: true,
        passwordHash: defaultPasswordHash,
      });
    }

    let staffMember = await StaffMember.findOne({ email });
    if (!staffMember) {
      staffMember = await StaffMember.create({
        userId: user._id,
        name: spec.name,
        email,
        roles: spec.roles,
        title: spec.title,
        country: spec.country,
        status: 'active',
        joinedDate: spec.joinedDate,
      });
    }
    staffDocs.push({ ...spec, id: staffMember._id, userId: user._id, staffMember });
  }

  const socialManager = staffDocs.find((s) => s.roles.includes('social_media_manager')) || staffDocs[0];
  const vettingStaff = staffDocs.filter((s) => s.roles.includes('opportunities_officer') || s.roles.includes('desk_lead'));
  const writers = staffDocs.filter((s) => s.roles.includes('opportunities_officer') || s.roles.includes('communications_officer'));
  const partnerOwners = staffDocs.filter((s) => s.roles.some((r) => ['partnerships_officer', 'country_lead', 'desk_lead'].includes(r)));
  const leads = staffDocs.filter((s) => s.roles.some((r) => ['country_lead', 'desk_lead'].includes(r)));

  // 2. Curated Opportunities / Listings (14 listings)
  const listingSpecs = [
    { title: 'Graduate Software Engineer', organisation: 'MTN Ghana', type: 'job', country: 'Ghana', monthsAgo: 0 },
    { title: 'Operations Analyst', organisation: 'Jumia', type: 'job', country: "Côte d'Ivoire", monthsAgo: 0 },
    { title: 'Mastercard Foundation Scholars Program', organisation: 'Ashesi University', type: 'scholarship', country: 'Ghana', monthsAgo: 1 },
    { title: 'Youth Innovation Fellowship', organisation: 'Africa Leadership Initiative', type: 'fellowship', country: 'Nigeria', monthsAgo: 1 },
    { title: 'Women in Agribusiness Grant', organisation: 'AGRA', type: 'grant', country: 'Kenya', monthsAgo: 2 },
    { title: 'Pan-African Career Fair 2026', organisation: 'Global Opportunity Desk', type: 'event', country: 'Rwanda', monthsAgo: 2 },
    { title: 'Junior Product Designer', organisation: 'Paystack', type: 'job', country: 'Nigeria', monthsAgo: 3 },
    { title: 'Data Analyst Internship', organisation: 'Flutterwave', type: 'internship', country: 'Nigeria', monthsAgo: 4 },
    { title: 'Climate Tech Fellowship', organisation: 'Wangari Maathai Institute', type: 'fellowship', country: 'Kenya', monthsAgo: 4 },
    { title: 'STEM Scholarship for Girls', organisation: 'Africa Education Trust', type: 'scholarship', country: 'Uganda', monthsAgo: 5 },
    { title: 'Public Health Research Internship', organisation: 'University of Ghana School of Public Health', type: 'internship', country: 'Ghana', monthsAgo: 5 },
    { title: 'Startup Seed Grant', organisation: 'Tony Elumelu Foundation', type: 'grant', country: 'Nigeria', monthsAgo: 0, draft: true, vetted: true },
    { title: 'Virtual Graduate Employability Summit', organisation: 'Global Opportunity Desk', type: 'event', country: 'Sierra Leone', monthsAgo: 0, draft: true, vetted: false },
    { title: 'Customer Success Associate', organisation: 'Wave Mobile Money', type: 'job', country: 'Senegal', monthsAgo: 1, draft: true, vetted: false },
  ];

  const FORMATS = ['online', 'in-person', 'hybrid'];
  const listingDocs = [];

  for (let index = 0; index < listingSpecs.length; index++) {
    const spec = listingSpecs[index];
    const created = dayIn(spec.monthsAgo, 0.15 + (index % 4) * 0.2);
    const published = !spec.draft;
    const vetted = published ? true : !!spec.vetted;
    const writer = writers[index % writers.length];
    const vetter = vetted ? vettingStaff[index % vettingStaff.length] : null;

    const views = published ? { website: between(600, 2400), app: between(300, 1200) } : { website: 0, app: 0 };
    const applications = published
      ? { website: Math.round(views.website * 0.04), app: Math.round(views.app * 0.05) }
      : { website: 0, app: 0 };

    const doc = await Opportunity.create({
      title: spec.title,
      company: spec.organisation,
      offeringOrganization: spec.organisation,
      type: spec.type,
      country: spec.country,
      location: spec.country,
      status: published ? 'published' : 'draft',
      moderationStatus: published ? 'approved' : 'pending',
      vetted,
      createdAt: new Date(addDays(created, -3)),
      publishedAt: published ? new Date(created) : undefined,
      closesAt: new Date(addDays(todayIso, 14 + ((index * 9) % 45))),
      description: `${spec.organisation} is offering "${spec.title}" to candidates in ${spec.country}.`,
      applyUrl: `https://example.org/apply/${spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      costLabel: spec.type === 'event' ? (index % 2 === 0 ? 'Free' : 'USD 20') : 'Free to apply',
      format: spec.type === 'event' ? FORMATS[index % 3] : FORMATS[(index + 1) % 3],
      durationLabel: spec.type === 'event' ? '1 day' : spec.type === 'job' ? undefined : '6 months',
      writerId: writer.userId,
      referralOnApply: index % 2 === 0,
      vettedBy: vetter?.userId,
      vettedOn: vetted ? (published ? created : addDays(created, -1)).slice(0, 10) : undefined,
      views,
      applications,
      createdBy: adminUser._id,
    });
    listingDocs.push(doc);
  }

  const publishedListings = listingDocs.filter((l) => l.status === 'published');

  // 3. Partners (18 partners with six-stage path)
  const partnerSpecs = [
    { name: 'MTN Ghana', country: 'Ghana', sector: 'Telecoms', contact: 'Efua Darko', path: [['prospect', 8], ['outreach', 7], ['proposal', 6], ['mou', 6], ['onboard', 5]] },
    { name: 'Ashesi University', country: 'Ghana', sector: 'Education', contact: 'Kwame Asante', path: [['prospect', 5], ['outreach', 4], ['proposal', 3], ['mou', 3], ['onboard', 2]] },
    { name: 'KNUST Careers Office', country: 'Ghana', sector: 'Education', contact: 'Akosua Bonsu', path: [['prospect', 4], ['outreach', 3], ['proposal', 2], ['mou', 2], ['onboard', 1]] },
    { name: 'Flutterwave', country: 'Nigeria', sector: 'Fintech', contact: 'Tunde Adeyemi', path: [['prospect', 8], ['outreach', 7], ['proposal', 6], ['mou', 5], ['onboard', 4], ['renew', 1]] },
    { name: 'Mastercard Foundation', country: 'Ghana', sector: 'Philanthropy', contact: 'Abena Owusu', path: [['prospect', 9], ['outreach', 8], ['proposal', 6], ['mou', 5], ['onboard', 4], ['renew', 1]] },
    { name: 'Andela', country: 'Nigeria', sector: 'Technology', contact: 'Emeka Nwosu', path: [['prospect', 5], ['outreach', 4], ['proposal', 2], ['mou', 1]] },
    { name: 'Paystack', country: 'Nigeria', sector: 'Fintech', contact: 'Ngozi Eze', path: [['prospect', 6], ['outreach', 4], ['proposal', 2], ['mou', 0]] },
    { name: 'Tony Elumelu Foundation', country: 'Nigeria', sector: 'Philanthropy', contact: 'Folake Balogun', path: [['prospect', 3], ['outreach', 2], ['proposal', 0]] },
    { name: 'Safaricom', country: 'Kenya', sector: 'Telecoms', contact: 'Wanjiru Kariuki', path: [['prospect', 3], ['outreach', 1], ['proposal', 0]] },
    { name: 'AGRA', country: 'Kenya', sector: 'Agriculture', contact: 'Otieno Mwangi', path: [['prospect', 4], ['outreach', 2], ['proposal', 1]] },
    { name: 'Jumia', country: "Côte d'Ivoire", sector: 'E-commerce', contact: 'Mariam Coulibaly', path: [['prospect', 2], ['outreach', 1]] },
    { name: 'Orange Senegal', country: 'Senegal', sector: 'Telecoms', contact: 'Fatou Ndiaye', path: [['prospect', 2], ['outreach', 0]] },
    { name: 'Ecobank', country: 'Ghana', sector: 'Banking', contact: 'Kofi Adjei', path: [['prospect', 3], ['outreach', 1]] },
    { name: 'Stanbic IBTC', country: 'Nigeria', sector: 'Banking', contact: 'Chidi Okafor', path: [['prospect', 1], ['outreach', 0]] },
    { name: 'Google Africa', country: 'Kenya', sector: 'Technology', contact: 'Amina Bello', path: [['prospect', 1]] },
    { name: 'University of Ghana Careers', country: 'Ghana', sector: 'Education', contact: 'Adwoa Tetteh', path: [['prospect', 0]] },
    { name: 'Wave Mobile Money', country: 'Senegal', sector: 'Fintech', contact: 'Seydou Keita', path: [['prospect', 1]] },
    { name: 'Africa Leadership University', country: 'Rwanda', sector: 'Education', contact: 'Nakato Mukasa', path: [['prospect', 0]] },
  ];

  const PARTNER_FACTS = [
    ['corporate', 'Graduate roles and internships'],
    ['university', 'Campus access and career talks'],
    ['university', 'Career office space and student referrals'],
    ['tech', 'Engineering internships and mentors'],
    ['foundation', 'Scholarship funding and programme grants'],
    ['tech', 'Remote engineering roles and bootcamp trainers'],
    ['tech', 'Fintech internships and product mentors'],
    ['foundation', 'Entrepreneurship grants'],
    ['corporate', 'Graduate trainee schemes'],
    ['ngo', 'Agribusiness fellowships and field placements'],
    ['corporate', 'Customer-experience internships'],
    ['corporate', 'Telecoms graduate roles'],
    ['corporate', 'Banking graduate programme places'],
    ['corporate', 'Finance internships'],
    ['tech', 'Product and cloud skills webinars'],
    ['university', 'Alumni network and venue hire'],
    ['tech', 'Mobile-money internships'],
    ['university', 'Leadership programme referrals'],
  ];

  const SOURCED = ['Ambassador introduction', 'Event contact', 'Inbound request', 'Desk lead outreach'];
  const partnerDocs = [];

  for (let index = 0; index < partnerSpecs.length; index++) {
    const spec = partnerSpecs[index];
    const history = spec.path.map(([stage, ago], step) => ({
      stage,
      at: clamp(dayIn(ago, 0.2 + step * 0.12)),
      from: step > 0 ? spec.path[step - 1][0] : undefined,
      by: adminUser._id,
      byName: adminUser.name,
    }));
    const owner = partnerOwners[index % partnerOwners.length];
    const currentStage = history[history.length - 1].stage;
    const isClosed = ['onboard', 'renew'].includes(currentStage);

    const doc = await Partner.create({
      organizationName: spec.name,
      country: spec.country,
      sector: spec.sector,
      partnerType: PARTNER_FACTS[index][0],
      assignedOwnerId: owner.userId,
      contactName: spec.contact,
      contactEmail: emailOf(spec.contact, `${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example.org`),
      contactPhone: `${DIAL_CODE[spec.country] ?? '+233'} 20 555 ${String(1000 + index * 7).slice(-4)}`,
      provides: PARTNER_FACTS[index][1],
      sourcedBy: SOURCED[index % SOURCED.length],
      notes: index % 6 === 0 ? 'Prefers email first, then a call.' : undefined,
      stage: currentStage,
      closed: isClosed,
      stageHistory: history,
      createdBy: adminUser._id,
    });
    partnerDocs.push(doc);
  }

  // 4. Programs (12 programs)
  const programSpecs = [
    { name: 'CV and Interview Masterclass', type: 'training', status: 'delivered', country: 'Ghana', endAgo: 5, partner: 0, people: 140 },
    { name: 'Remote Work Readiness Cohort', type: 'bootcamp', status: 'delivered', country: 'Nigeria', endAgo: 4, partner: 1, people: 60 },
    { name: 'Scholarship Application Clinic', type: 'outreach', status: 'delivered', country: 'Kenya', endAgo: 2, people: 85 },
    { name: 'Women in Tech Webinar Series', type: 'webinar', status: 'delivered', country: 'Ghana', endAgo: 2, partner: 1, people: 310 },
    { name: 'Campus Ambassador Bootcamp', type: 'bootcamp', status: 'delivered', country: 'Uganda', endAgo: 1, people: 45 },
    { name: 'Graduate Employability Summit Prep', type: 'event', status: 'delivered', country: 'Sierra Leone', endAgo: 0, partner: 2, people: 120 },
    { name: 'Career Mentorship Circle', type: 'mentorship', status: 'running', country: 'Ghana', partner: 4, people: 38 },
    { name: 'Digital Skills Cohort 3', type: 'project', status: 'running', country: 'Nigeria', partner: 6, people: 72 },
    { name: 'Study Abroad Info Campaign', type: 'outreach', status: 'running', country: 'Rwanda', people: 0 },
    { name: 'Entrepreneurship Pitch Day', type: 'event', status: 'planned', country: 'Kenya', partner: 7, people: 0 },
    { name: 'Climate Careers Webinar', type: 'webinar', status: 'planned', country: 'Senegal', people: 0 },
    { name: 'Regional Hackathon', type: 'project', status: 'cancelled', country: "Côte d'Ivoire", endAgo: 2, people: 0 },
  ];

  const CITIES = {
    Ghana: 'Accra',
    Nigeria: 'Lagos',
    Kenya: 'Nairobi',
    Uganda: 'Kampala',
    'Sierra Leone': 'Freetown',
    Rwanda: 'Kigali',
    Senegal: 'Dakar',
    "Côte d'Ivoire": 'Abidjan',
  };
  const FACILITATORS = [['Kwabena Tetteh'], ['Kwabena Tetteh', 'Esi Mensah-Owusu'], ['Fatou Ndiaye'], ['Adaeze Okonkwo', 'Kwabena Tetteh']];

  for (let index = 0; index < programSpecs.length; index++) {
    const spec = programSpecs[index];
    let startAt;
    let endAt;
    let deliveredAt;

    if (spec.status === 'delivered') {
      const endIso = dayIn(spec.endAgo ?? 1, 0.55 + (index % 3) * 0.1);
      deliveredAt = new Date(`${endIso}T12:00:00Z`);
      endAt = deliveredAt;
      startAt = new Date(`${addDays(endIso, -12)}T09:00:00Z`);
    } else if (spec.status === 'cancelled') {
      const startIso = dayIn(spec.endAgo ?? 2, 0.4);
      startAt = new Date(`${startIso}T09:00:00Z`);
      endAt = new Date(`${addDays(startIso, 3)}T17:00:00Z`);
    } else if (spec.status === 'running') {
      startAt = new Date(`${dayIn(1, 0.5)}T09:00:00Z`);
      endAt = new Date(`${addDays(todayIso, 25)}T17:00:00Z`);
    } else {
      const startIso = addDays(todayIso, 12 + index);
      startAt = new Date(`${startIso}T09:00:00Z`);
      endAt = new Date(`${addDays(startIso, 2)}T17:00:00Z`);
    }

    const partner = spec.partner !== undefined ? partnerDocs[spec.partner] : null;

    await Program.create({
      title: spec.name,
      programType: spec.type,
      status: spec.status,
      country: spec.country,
      location: index % 3 === 1 ? 'Online' : CITIES[spec.country],
      format: (['in-person', 'online', 'hybrid'])[index % 3],
      participantCount: spec.people,
      participantTarget: spec.people > 0 ? Math.max(spec.people, Math.round(spec.people * 1.2)) : 40 + (index % 4) * 10,
      startAt,
      endAt,
      deliveredAt,
      partnerId: partner?._id,
      facilitators: FACILITATORS[index % FACILITATORS.length],
      notes: index % 5 === 0 ? 'Run with partner alumni network.' : undefined,
      createdBy: adminUser._id,
    });
  }

  // 5. Ambassadors (40 ambassadors)
  const joinedBy = [];
  const pushJoin = (ago, count) => joinedBy.push(...Array(count).fill(ago));
  pushJoin(7, 15);
  pushJoin(5, 2);
  pushJoin(4, 3);
  pushJoin(3, 1);
  pushJoin(2, 3);
  pushJoin(1, 3);
  pushJoin(0, 2);

  const dormantAt = new Map([
    [2, 3],
    [5, 3],
    [9, 2],
    [16, 1],
  ]);

  const usedCodes = new Set();
  const codeAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const referralCode = () => {
    for (;;) {
      let code = 'GOD-';
      for (let i = 0; i < 6; i++) code += codeAlphabet[Math.floor(rand() * codeAlphabet.length)];
      if (!usedCodes.has(code)) {
        usedCodes.add(code);
        return code;
      }
    }
  };

  const ambassadorDocs = [];
  const tiers = ['lead', 'lead', 'lead', 'lead', 'lead', 'senior', 'senior', 'senior', 'senior', 'senior', 'senior', 'senior', 'senior', 'senior', 'senior'];
  const ROLE_TITLES = { lead: 'Campus lead', senior: 'Senior ambassador', ambassador: 'Campus ambassador' };
  const MEMBER_ORDER = ['student', 'student', 'graduate', 'volunteer'];

  const createAmb = async (status, joinedAgo, fraction, tier, dormantAgo) => {
    const index = ambassadorDocs.length;
    const campus = CAMPUSES[(index * 3 + 1) % CAMPUSES.length];
    const name = fullName(index, 4);
    const lead = leads[index % leads.length];
    const joinedAt = clamp(dayIn(joinedAgo, fraction));
    const dormantSince = dormantAgo !== undefined ? clamp(dayIn(dormantAgo, 0.6)) : undefined;

    const doc = await Ambassador.create({
      fullName: name,
      email: emailOf(name, 'students.example.edu'),
      phone: `${DIAL_CODE[campus.country] ?? '+233'} 24 555 ${String(2000 + index * 13).slice(-4)}`,
      city: CAMPUS_CITY[campus.name] ?? campus.country,
      country: campus.country,
      campus: campus.name,
      memberType: MEMBER_ORDER[index % MEMBER_ORDER.length],
      description: index % 4 === 0 ? `Shares listings with the ${campus.name} career club.` : undefined,
      roleTitle: `${ROLE_TITLES[tier]}, ${campus.name}`,
      tier,
      status,
      assignedLeadId: status === 'applicant' ? undefined : lead.userId,
      trained: status === 'active' || status === 'dormant' ? index % 5 !== 0 : false,
      referralCode: referralCode(),
      joinedAt,
      dormantSince,
      createdBy: adminUser._id,
    });
    ambassadorDocs.push(doc);
  };

  for (let i = 0; i < joinedBy.length; i++) {
    const ago = joinedBy[i];
    const dormantAgo = dormantAt.get(i);
    const tier = tiers[i % tiers.length] ?? 'ambassador';
    await createAmb(dormantAgo !== undefined ? 'dormant' : 'active', ago, (i % 5) * 0.2, i < tiers.length ? tier : 'ambassador', dormantAgo);
  }
  for (let i = 0; i < 6; i++) await createAmb('onboarding', i < 3 ? 0 : 1, 0.2 + i * 0.12, 'ambassador');
  for (let i = 0; i < 5; i++) await createAmb('applicant', 0, 0.1 + i * 0.15, 'ambassador');

  // 6. Amplifications
  const channels = ['whatsapp', 'linkedin', 'instagram', 'facebook', 'x'];
  const amplificationDocs = [];

  for (let a = 0; a < ambassadorDocs.length; a++) {
    const amb = ambassadorDocs[a];
    if (amb.status === 'applicant') continue;
    const shares = between(1, 4);

    for (let s = 0; s < shares; s++) {
      const listing = publishedListings[(a * 3 + s * 5) % publishedListings.length];
      const earliest = amb.joinedAt > (listing.publishedAt?.toISOString().slice(0, 10) ?? '') ? amb.joinedAt : (listing.publishedAt?.toISOString().slice(0, 10) || todayIso);
      const at = clamp(addDays(earliest, between(1, 20)));
      const clicks = 20 + ((a * 29 + s * 53 + amplificationDocs.length * 7) % 61);
      const apps = Math.round(clicks * (0.05 + rand() * 0.1));

      const amp = await AmbassadorAmplification.create({
        ambassadorId: amb._id,
        listingId: listing._id,
        channel: channels[(a + s) % channels.length],
        at,
        clicks,
        applications: apps,
        loggedBy: adminUser._id,
      });
      amplificationDocs.push(amp);
    }
  }

  // 7. Database Records (Beneficiaries - 120 records)
  const verifiedThisMonth = Math.max(1, Math.round(15 * (elapsed / daysIn(0)) * 1.05));
  const verifiedPerMonth = [
    [5, 15],
    [4, 16],
    [3, 11],
    [2, 15],
    [1, 16],
    [0, verifiedThisMonth],
  ];

  const sourceMix = [
    ...Array(46).fill('organic'),
    ...Array(29).fill('ambassador'),
    ...Array(22).fill('event'),
    ...Array(14).fill('partner'),
    ...Array(9).fill('import'),
  ];

  const sourceAmbassadors = ambassadorDocs.filter((a) => a.status === 'active' || a.status === 'dormant');
  const beneficiaryDocs = [];

  const addBeneficiary = async (verifiedAgo, fraction, fixedGap) => {
    const index = beneficiaryDocs.length;
    const campus = CAMPUSES[(index * 7 + 2) % CAMPUSES.length];
    const source = sourceMix[(index * 53 + 7) % sourceMix.length];
    const viaAmbassador = source === 'ambassador';
    const name = fullName(index, 11);
    const createdAt = verifiedAgo === null ? dayIn(index % 3, fraction) : addDays(dayIn(verifiedAgo, fraction), -(fixedGap ?? between(2, 9)));
    const verifiedAt = verifiedAgo !== null ? dayIn(verifiedAgo, fraction) : undefined;

    let assignedAmb = null;
    if (viaAmbassador && sourceAmbassadors.length > 0) {
      assignedAmb = sourceAmbassadors.find((a) => a.joinedAt <= (verifiedAt || createdAt)) || sourceAmbassadors[0];
    }
    const listing = index % 3 === 0 ? publishedListings[(index * 2) % publishedListings.length] : null;

    const doc = await Beneficiary.create({
      fullName: name,
      email: emailOf(name),
      phone: `${DIAL_CODE[campus.country] ?? '+233'} 20 555 ${String(1000 + index * 7).slice(-4)}`,
      country: campus.country,
      institution: campus.name,
      source,
      verified: verifiedAgo !== null,
      createdAtDate: createdAt,
      verifiedAt,
      ambassadorId: assignedAmb?._id,
      opportunityId: listing?._id,
      addedBy: adminUser._id,
    });
    beneficiaryDocs.push(doc);
  };

  for (const [ago, count] of verifiedPerMonth) {
    for (let i = 0; i < count; i++) {
      await addBeneficiary(ago, (i + 0.5) / count, ago === 0 && i >= 15 ? 3 + (i % 5) : undefined);
    }
  }
  while (beneficiaryDocs.length < 120) {
    await addBeneficiary(null, (beneficiaryDocs.length % 10) / 10);
  }

  // 8. Social Posts (60 posts)
  const socialPlatforms = ['facebook', 'instagram', 'x', 'linkedin', 'tiktok', 'youtube'];
  const postTexts = [
    'New: {t} is open for applications. Link in bio.',
    'Meet one of our ambassadors from {c}. Their story inspires us.',
    '3 tips to make your CV stand out to recruiters.',
    'Apply early: {t} closes soon.',
    'This week on the desk: {t}.',
    'Missed our last webinar? The recording is live.',
  ];
  const postTitles = [
    'Applications are open for the {t} role',
    'Meet our ambassador from {c}',
    'Three tips to make your CV stand out',
    'Apply early: the {t} role closes soon',
    'This week on the desk: the {t} role',
    'Missed our last webinar? The recording is live',
  ];

  let socialPostCount = 0;
  const addPost = async (status, postedAtIso, reach, engagement) => {
    const index = socialPostCount++;
    const listing = publishedListings[index % publishedListings.length];
    const campus = CAMPUSES[index % CAMPUSES.length];
    const platform = socialPlatforms[index % socialPlatforms.length];
    const title = postTitles[index % postTitles.length].replace('{t}', listing.title).replace('{c}', campus.name);
    const text = postTexts[index % postTexts.length].replace('{t}', listing.title).replace('{c}', campus.name);

    await SocialPost.create({
      platform,
      title,
      text,
      url: `https://social.example/${platform}/post-${pad(index + 1)}`,
      status,
      postedAt: new Date(`${postedAtIso}T12:00:00Z`),
      reach,
      engagement,
      listingId: listing._id,
      authorId: socialManager.userId,
      createdBy: adminUser._id,
    });
  };

  const pastPublished = [
    [5, 9],
    [4, 9],
    [3, 7],
    [2, 9],
    [1, 9],
  ];

  for (const [ago, count] of pastPublished) {
    const strength = ago === 3 ? 0.88 : 1;
    for (let i = 0; i < count; i++) {
      await addPost(
        'published',
        dayIn(ago, (i + 0.5) / count),
        Math.round(1350 * strength * (0.9 + rand() * 0.2)),
        Math.round(100 * strength * (0.9 + rand() * 0.2))
      );
    }
  }

  const share = elapsed / daysIn(0);
  const currentPosts = Math.min(9, Math.max(1, Math.ceil(8 * share * 1.15)));
  const reachTotal = Math.round(10500 * share * (0.8 + rand() * 0.04));
  const engagementTotal = Math.round(800 * share * (0.78 + rand() * 0.04));

  for (let i = 0; i < currentPosts; i++) {
    await addPost(
      'published',
      dayIn(0, (i + 0.5) / currentPosts),
      Math.round(reachTotal / currentPosts),
      Math.round(engagementTotal / currentPosts)
    );
  }
  for (let i = 0; i < 5; i++) await addPost('scheduled', addDays(todayIso, 1 + i * 2), 0, 0);
  while (socialPostCount < 60) await addPost('draft', addDays(todayIso, 8 + socialPostCount * 2), 0, 0);

  // 9. Testimonials (9 testimonials)
  const testimonialSpecs = [
    ['Abena Owusu', 'Software engineer, Accra', 'I found my first job through a listing on the desk. The vetting made me trust it from day one.', 'approved'],
    ['Chidi Okafor', 'Product designer, Lagos', 'The CV masterclass changed how I write about my work. I had three interviews in two weeks.', 'approved'],
    ['Wanjiru Kariuki', 'MSc student, Nairobi', 'A scholarship I would never have seen reached me through a campus ambassador.', 'approved'],
    ['Kofi Adjei', 'Operations analyst, Kumasi', 'Clear listings, honest deadlines. I recommend it to every graduate I know.', 'pending'],
    ['Ngozi Eze', 'Fintech analyst, Abuja', 'The remote work cohort gave me the confidence to apply abroad.', 'pending'],
    ['Seydou Keita', 'Data intern, Dakar', 'Great programs, though I wish there were more in French.', 'pending'],
    ['Isatu Kamara', 'Public health researcher, Freetown', 'Thank you for the fellowship alert. I applied the same night.', 'unpublished'],
    ['Moussa Traore', 'Student, Abidjan', 'Not the experience I expected.', 'rejected'],
    ['Zainab Bello', 'Entrepreneur, Kano', 'Please remove my details from the website.', 'rejected'],
  ];

  for (let index = 0; index < testimonialSpecs.length; index++) {
    const [author, role, quote, status] = testimonialSpecs[index];
    const subIso = dayIn(index % 3, 0.2 + (index % 5) * 0.15);
    const subDate = new Date(`${subIso}T10:00:00Z`);

    await Testimonial.create({
      name: author,
      email: emailOf(author),
      role,
      comment: quote,
      status,
      submittedAt: subDate,
      decidedAt: status !== 'pending' ? subDate : undefined,
      decidedBy: status !== 'pending' ? adminUser._id : undefined,
    });
  }

  // 10. Website Audience Traffic (6 months)
  const channelShares = [
    ['Organic search', 0.38],
    ['Direct', 0.24],
    ['Social media', 0.22],
    ['Referral', 0.1],
    ['Email', 0.06],
  ];
  const fullMonthViews = [13200, 13800, 10200, 14100, 14900, 15200];

  for (let i = 0; i < fullMonthViews.length; i++) {
    const full = fullMonthViews[i];
    const ago = 5 - i;
    const views = ago === 0 ? Math.round(full * share * (0.97 + rand() * 0.06)) : full;
    const days = ago === 0 ? elapsed : daysIn(ago);
    const channelViews = channelShares.map(([c, part]) => ({ channel: c, views: Math.round(views * part) }));
    channelViews[0].views += views - channelViews.reduce((sum, row) => sum + row.views, 0);

    const m = monthKey(ago);
    await WebsiteMonth.findOneAndUpdate(
      { month: m },
      {
        $set: {
          month: m,
          views,
          dailyFirstVisits: Math.round(views / days / 2.6),
          dailyVisitors: Math.round(views / days / 1.35),
          channels: channelViews,
          source: 'manual',
          updatedBy: adminUser._id,
          updatedByName: adminUser.name,
        },
      },
      { upsert: true, new: true }
    );
  }

  // 11. Target & Threshold Changes
  let seq = 1;
  const initialEffectiveMonth = monthKey(5);

  for (const [kpi, value] of Object.entries(DEFAULT_TARGETS)) {
    const existingTarget = await TargetChange.findOne({ kpi, effectiveFrom: initialEffectiveMonth });
    if (!existingTarget) {
      await TargetChange.create({
        kpi,
        value,
        effectiveFrom: initialEffectiveMonth,
        seq: seq++,
        changedBy: adminUser._id,
        changedByName: adminUser.name || 'Initial Setup',
        changedAt: todayIso,
      });
    }
  }

  const existingThreshold = await ThresholdChange.findOne({ effectiveFrom: initialEffectiveMonth });
  if (!existingThreshold) {
    await ThresholdChange.create({
      green: DEFAULT_THRESHOLDS.green,
      amber: DEFAULT_THRESHOLDS.amber,
      effectiveFrom: initialEffectiveMonth,
      seq: 1,
      changedBy: adminUser._id,
      changedByName: adminUser.name || 'Initial Setup',
      changedAt: todayIso,
    });
  }

  // 12. Monthly Reports (4 past reports)
  for (let ago = 5; ago >= 1; ago--) {
    if (ago === 3) continue; // Weak month skipped
    const repMonth = monthKey(ago);
    const existing = await MonthlyReport.findOne({ reportMonth: repMonth, view: 'partner' });
    if (!existing) {
      await MonthlyReport.create({
        reportMonth: repMonth,
        view: 'partner',
        generatedAt: new Date(`${dayIn(ago, 0.1)}T10:00:00Z`),
        generatedBy: adminUser._id,
        generatedByName: adminUser.name || 'E2E Admin',
      });
    }
  }

  return {
    staffCount: staffDocs.length,
    listingCount: listingDocs.length,
    partnerCount: partnerDocs.length,
    ambassadorCount: ambassadorDocs.length,
    beneficiaryCount: beneficiaryDocs.length,
    socialPostCount,
  };
}
