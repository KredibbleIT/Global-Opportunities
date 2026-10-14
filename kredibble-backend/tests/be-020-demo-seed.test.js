import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app } from '../src/app.js';
import { signAdminToken } from '../src/middleware/auth.js';
import { seedDemoData, DEFAULT_TARGETS, DEFAULT_THRESHOLDS } from '../src/lib/demo-seed.js';
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
  ReferenceDataList,
} from '../src/models/AdminPortal.js';
import { User, StaffMember } from '../src/models/User.js';
import { Opportunity } from '../src/models/Platform.js';
import { ROLE_IDS } from '../src/lib/permissions.js';
import { getKpiCardsForMonth } from '../src/lib/kpi-engine.js';

describe('BE-020: Demo Seed for Real-Mode Test Run', () => {
  let adminUser;

  beforeEach(async () => {
    adminUser = await User.create({
      name: 'Primary E2E Admin',
      email: 'primary.admin@kredibble.com',
      role: 'admin',
      emailVerified: true,
      tokenVersion: 0,
      passwordHash: await bcrypt.hash('Password123', 12),
    });
  });

  describe('Part 1: Demo Seed Data Population & Quantities', () => {
    it('executes seedDemoData and returns populated counts matching admin mock specifications', async () => {
      const summary = await seedDemoData({ adminUser });

      expect(summary.staffCount).toBe(13);
      expect(summary.listingCount).toBe(14);
      expect(summary.partnerCount).toBe(18);
      expect(summary.ambassadorCount).toBe(40);
      expect(summary.beneficiaryCount).toBe(120);
      expect(summary.socialPostCount).toBe(60);

      const programCount = await Program.countDocuments();
      expect(programCount).toBe(12);

      const testimonialCount = await Testimonial.countDocuments();
      expect(testimonialCount).toBe(9);

      const websiteMonthCount = await WebsiteMonth.countDocuments();
      expect(websiteMonthCount).toBe(6);

      const monthlyReportCount = await MonthlyReport.countDocuments();
      expect(monthlyReportCount).toBe(4);

      const refDataCount = await ReferenceDataList.countDocuments();
      expect(refDataCount).toBeGreaterThan(0);
    });

    it('ensures all 12 platform role IDs are represented across seeded staff members', async () => {
      await seedDemoData({ adminUser });

      const allStaff = await StaffMember.find({});
      const coveredRoles = new Set();
      for (const staff of allStaff) {
        for (const role of staff.roles) {
          coveredRoles.add(role);
        }
      }

      for (const roleId of ROLE_IDS) {
        expect(coveredRoles.has(roleId)).toBe(true);
      }
    });

    it('creates matching User accounts with admin role for every staff member', async () => {
      await seedDemoData({ adminUser });

      const staffMembers = await StaffMember.find({});
      for (const staff of staffMembers) {
        expect(staff.userId).toBeDefined();
        const user = await User.findById(staff.userId).select('+passwordHash');
        expect(user).not.toBeNull();
        expect(user.email).toBe(staff.email);
        expect(user.role).toBe('admin');
        expect(user.passwordHash).toBeDefined();
      }
    });

    it('creates a StaffMember record for the calling admin user with desk_lead and super_admin privileges', async () => {
      await seedDemoData({ adminUser });

      const staffRecord = await StaffMember.findOne({ userId: adminUser._id });
      expect(staffRecord).not.toBeNull();
      expect(staffRecord.roles).toContain('desk_lead');
      expect(staffRecord.roles).toContain('super_admin');
    });
  });

  describe('Part 2: Relational Foreign Key Integrity & Schema Invariants', () => {
    beforeEach(async () => {
      await seedDemoData({ adminUser });
    });

    it('verifies partner program relationships and delivered dates', async () => {
      const deliveredPrograms = await Program.find({ status: 'delivered' });
      expect(deliveredPrograms.length).toBeGreaterThan(0);

      for (const prog of deliveredPrograms) {
        expect(prog.deliveredAt).toBeDefined();
        if (prog.partnerId) {
          const partner = await Partner.findById(prog.partnerId);
          expect(partner).not.toBeNull();
        }
      }
    });

    it('verifies partner six-stage paths and closed flags', async () => {
      const partners = await Partner.find({});
      expect(partners.length).toBe(18);

      for (const p of partners) {
        expect(p.stageHistory.length).toBeGreaterThan(0);
        const lastStage = p.stageHistory[p.stageHistory.length - 1].stage;
        expect(p.stage).toBe(lastStage);
        if (['onboard', 'renew'].includes(p.stage.toLowerCase())) {
          expect(p.closed).toBe(true);
        }
      }
    });

    it('verifies ambassador referral code uniqueness and amplification logs', async () => {
      const ambassadors = await Ambassador.find({});
      expect(ambassadors.length).toBe(40);

      const codes = ambassadors.map((a) => a.referralCode);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(40);

      for (const code of codes) {
        expect(code).toMatch(/^GOD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
      }

      const amplifications = await AmbassadorAmplification.find({});
      expect(amplifications.length).toBeGreaterThan(0);
      for (const amp of amplifications) {
        const amb = await Ambassador.findById(amp.ambassadorId);
        expect(amb).not.toBeNull();
        const listing = await Opportunity.findById(amp.listingId);
        expect(listing).not.toBeNull();
        expect(amp.clicks).toBeGreaterThanOrEqual(20);
      }
    });

    it('verifies beneficiary sources and verification dates', async () => {
      const beneficiaries = await Beneficiary.find({});
      expect(beneficiaries.length).toBe(120);

      const verifiedRecords = beneficiaries.filter((b) => b.verified);
      expect(verifiedRecords.length).toBeGreaterThan(50);

      for (const rec of verifiedRecords) {
        expect(rec.verifiedAt).toBeDefined();
        expect(rec.createdAtDate).toBeDefined();
        if (rec.source === 'ambassador' && rec.ambassadorId) {
          const amb = await Ambassador.findById(rec.ambassadorId);
          expect(amb).not.toBeNull();
        }
      }
    });

    it('verifies social posts platforms, reach, and engagement', async () => {
      const posts = await SocialPost.find({});
      expect(posts.length).toBe(60);

      const publishedPosts = posts.filter((p) => p.status === 'published');
      expect(publishedPosts.length).toBeGreaterThan(30);

      for (const post of publishedPosts) {
        expect(post.reach).toBeGreaterThan(0);
        expect(post.engagement).toBeGreaterThan(0);
        expect(post.authorId).toBeDefined();
      }
    });

    it('verifies website traffic channel totals match views exactly', async () => {
      const months = await WebsiteMonth.find({});
      expect(months.length).toBe(6);

      for (const m of months) {
        const sum = m.channels.reduce((acc, c) => acc + c.views, 0);
        expect(sum).toBe(m.views);
        expect(m.dailyFirstVisits).toBeGreaterThan(0);
        expect(m.dailyVisitors).toBeGreaterThan(0);
      }
    });

    it('records initial TargetChange and ThresholdChange immutable audit logs', async () => {
      const targetChanges = await TargetChange.find({});
      expect(targetChanges.length).toBe(Object.keys(DEFAULT_TARGETS).length);

      for (const [kpi, value] of Object.entries(DEFAULT_TARGETS)) {
        const change = targetChanges.find((tc) => tc.kpi === kpi);
        expect(change).toBeDefined();
        expect(change.value).toBe(value);
      }

      const thresholdChanges = await ThresholdChange.find({});
      expect(thresholdChanges.length).toBe(1);
      expect(thresholdChanges[0].green).toBe(DEFAULT_THRESHOLDS.green);
      expect(thresholdChanges[0].amber).toBe(DEFAULT_THRESHOLDS.amber);
    });
  });

  describe('Part 3: KPI Engine & Scorecards Subsystem Integration', () => {
    beforeEach(async () => {
      await seedDemoData({ adminUser });
    });

    it('calculates all 10 KPIs successfully against seeded demo records', async () => {
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

      const result = await getKpiCardsForMonth(currentMonth, now);
      expect(result.cards).toHaveLength(10);

      const kpiMap = new Map(result.cards.map((k) => [k.key, k]));
      expect(kpiMap.has('opportunities_published')).toBe(true);
      expect(kpiMap.has('programs_organised')).toBe(true);
      expect(kpiMap.has('active_ambassadors')).toBe(true);
      expect(kpiMap.has('partners_onboarded')).toBe(true);
      expect(kpiMap.has('beneficiaries_verified')).toBe(true);
      expect(kpiMap.has('social_reach')).toBe(true);
      expect(kpiMap.has('social_engagement')).toBe(true);
      expect(kpiMap.has('posts_published')).toBe(true);
      expect(kpiMap.has('website_views')).toBe(true);
      expect(kpiMap.has('monthly_reports')).toBe(true);

      for (const card of result.cards) {
        expect(typeof card.value).toBe('number');
        expect(typeof card.target).toBe('number');
        expect(card.target).toBeGreaterThan(0);
      }
    });

    it('serves personal scorecard and team scorecards API endpoints for seeded staff', async () => {
      const adminCookie = `kredibble_admin_token=${signAdminToken(adminUser)}`;

      const meRes = await request(app)
        .get('/api/v1/admin/scorecards/me')
        .set('Cookie', adminCookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data).toBeDefined();
      expect(meRes.body.data.staff.name).toBe(adminUser.name);
      expect(Array.isArray(meRes.body.data.metrics)).toBe(true);

      const teamRes = await request(app)
        .get('/api/v1/admin/scorecards/team')
        .set('Cookie', adminCookie);

      expect(teamRes.status).toBe(200);
      expect(teamRes.body.data).toBeDefined();
      expect(teamRes.body.data.people.length).toBeGreaterThan(0);
      expect(teamRes.body.data.summary).toBeDefined();
    });
  });
});
