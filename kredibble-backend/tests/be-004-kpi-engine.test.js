import request from 'supertest';
import { app } from '../src/app.js';
import { User, StaffMember } from '../src/models/User.js';
import { Opportunity } from '../src/models/Platform.js';
import {
  Program,
  Partner,
  Ambassador,
  Beneficiary,
  SocialPost,
  WebsiteMonth,
  MonthlyReport,
} from '../src/models/AdminPortal.js';
import { signAdminToken, signToken } from '../src/middleware/auth.js';
import {
  KPI_DEFINITIONS,
  KPI_KEYS,
  isPastMonth,
  monthProgress,
  kpiMonthProgress,
  calculateKpiCard,
  rankPriorities,
  formatMonthLabel,
} from '../src/lib/kpi-engine.js';
import { saveTargetBatch } from '../src/lib/targets.js';

describe('BE-004: KPI Engine Subsystem', () => {
  let adminUser;
  let adminCookie;
  let staffUser;
  let staffToken;

  describe('Pure KPI calculation functions', () => {
    it('defines exactly 10 canonical KPIs matching admin specifications', () => {
      expect(KPI_DEFINITIONS).toHaveLength(10);
      expect(KPI_KEYS).toHaveLength(10);
      const keys = KPI_DEFINITIONS.map((d) => d.key);
      expect(keys).toEqual(KPI_KEYS);

      const runningTotals = KPI_DEFINITIONS.filter((d) => d.kind === 'running_total');
      expect(runningTotals).toHaveLength(1);
      expect(runningTotals[0].key).toBe('active_ambassadors');

      const counts = KPI_DEFINITIONS.filter((d) => d.kind === 'count');
      expect(counts).toHaveLength(9);
    });

    it('correctly assesses isPastMonth and monthProgress', () => {
      const fixedToday = new Date('2026-10-15T12:00:00.000Z');

      expect(isPastMonth('2026-09', fixedToday)).toBe(true);
      expect(isPastMonth('2026-10', fixedToday)).toBe(false);
      expect(isPastMonth('2026-11', fixedToday)).toBe(false);

      // Past month gives full progress (30 of 30 days)
      const pastProg = monthProgress('2026-09', fixedToday);
      expect(pastProg.dayOfMonth).toBe(30);
      expect(pastProg.daysInMonth).toBe(30);

      // Current month gives day of month (15 of 31 days)
      const curProg = monthProgress('2026-10', fixedToday);
      expect(curProg.dayOfMonth).toBe(15);
      expect(curProg.daysInMonth).toBe(31);

      // Running total always evaluates against full month
      const runningProg = kpiMonthProgress('running_total', '2026-10', fixedToday);
      expect(runningProg.dayOfMonth).toBe(31);
      expect(runningProg.daysInMonth).toBe(31);
    });

    it('calculates pro-rated targets and statuses for count KPIs in open current month', () => {
      const fixedToday = new Date('2026-10-10T00:00:00.000Z'); // Day 10 of 31
      const countDef = KPI_DEFINITIONS.find((d) => d.key === 'opportunities_published');

      // Target = 31, Day 10 -> pro-rated target = 10
      // If value = 10, attainment against pro-rated target = 1.0 (100% -> On track)
      const cardOnTrack = calculateKpiCard(countDef, 10, 31, '2026-10', fixedToday);
      expect(cardOnTrack.proratedTarget).toBeCloseTo(10, 1);
      expect(cardOnTrack.pace).toBeCloseTo(10 / 31, 2);
      expect(cardOnTrack.paceAttainment).toBeCloseTo(1.0, 2);
      expect(cardOnTrack.status).toBe('green');
      expect(cardOnTrack.statusLabel).toBe('On track');

      // If value = 8, attainment against pro-rated target = 8 / 10 = 0.8 (Between 70% and 95% -> Behind)
      const cardBehind = calculateKpiCard(countDef, 8, 31, '2026-10', fixedToday);
      expect(cardBehind.paceAttainment).toBeCloseTo(0.8, 2);
      expect(cardBehind.status).toBe('amber');
      expect(cardBehind.statusLabel).toBe('Behind');

      // If value = 5, attainment against pro-rated target = 5 / 10 = 0.5 (< 70% -> Off track)
      const cardOffTrack = calculateKpiCard(countDef, 5, 31, '2026-10', fixedToday);
      expect(cardOffTrack.paceAttainment).toBeCloseTo(0.5, 2);
      expect(cardOffTrack.status).toBe('red');
      expect(cardOffTrack.statusLabel).toBe('Off track');
    });

    it('evaluates running total KPIs against the full target without pro-rating', () => {
      const fixedToday = new Date('2026-10-10T00:00:00.000Z');
      const runningDef = KPI_DEFINITIONS.find((d) => d.key === 'active_ambassadors');

      // Target = 100, Value = 95 -> Attainment = 95 / 100 = 0.95 (Green)
      const card = calculateKpiCard(runningDef, 95, 100, '2026-10', fixedToday);
      expect(card.prorated).toBe(false);
      expect(card.pace).toBe(1);
      expect(card.proratedTarget).toBe(100);
      expect(card.paceAttainment).toBe(0.95);
      expect(card.status).toBe('green');
      expect(card.statusLabel).toBe('On track');
    });

    it('evaluates past closed months against full targets', () => {
      const fixedToday = new Date('2026-10-20T00:00:00.000Z');
      const countDef = KPI_DEFINITIONS.find((d) => d.key === 'programs_organised');

      // Past month 2026-09
      const card = calculateKpiCard(countDef, 2, 2, '2026-09', fixedToday);
      expect(card.isPast).toBe(true);
      expect(card.pace).toBe(1);
      expect(card.proratedTarget).toBe(2);
      expect(card.paceAttainment).toBe(1.0);
      expect(card.status).toBe('green');
    });

    it('returns null status when target is zero', () => {
      const countDef = KPI_DEFINITIONS.find((d) => d.key === 'posts_published');
      const card = calculateKpiCard(countDef, 5, 0, '2026-10', new Date('2026-10-15T00:00:00.000Z'));
      expect(card.target).toBe(0);
      expect(card.attainment).toBeNull();
      expect(card.status).toBeNull();
      expect(card.statusLabel).toBeNull();
    });

    it('ranks priorities strictly by lowest pro-rated attainment first, preserving KPI order on ties', () => {
      const today = new Date('2026-10-15T00:00:00.000Z');
      const cards = KPI_DEFINITIONS.map((def) => {
        // Assign diverse values
        if (def.key === 'opportunities_published') {
          return calculateKpiCard(def, 10, 10, '2026-10', today); // 100%
        }
        if (def.key === 'programs_organised') {
          return calculateKpiCard(def, 0, 10, '2026-10', today); // 0% (worst)
        }
        if (def.key === 'active_ambassadors') {
          return calculateKpiCard(def, 5, 10, '2026-10', today); // 50%
        }
        if (def.key === 'partners_onboarded') {
          return calculateKpiCard(def, 0, 10, '2026-10', today); // 0% (tied with programs_organised)
        }
        return calculateKpiCard(def, 0, 0, '2026-10', today); // target 0 (excluded)
      });

      const priorities = rankPriorities(cards);
      expect(priorities.length).toBe(4);

      // programs_organised (idx 1) and partners_onboarded (idx 3) both have 0% attainment
      // programs_organised should come first because it appears earlier in definition order
      expect(priorities[0].key).toBe('programs_organised');
      expect(priorities[1].key).toBe('partners_onboarded');
      expect(priorities[2].key).toBe('active_ambassadors');
      expect(priorities[3].key).toBe('opportunities_published');

      // Slicing by count
      const top2 = rankPriorities(cards, 2);
      expect(top2).toHaveLength(2);
      expect(top2[0].key).toBe('programs_organised');
      expect(top2[1].key).toBe('partners_onboarded');
    });

    it('formats month labels correctly for trend charts', () => {
      expect(formatMonthLabel('2026-10')).toEqual({
        month: '2026-10',
        label: 'Oct',
        tooltipLabel: 'October 2026',
      });
      expect(formatMonthLabel('2026-01')).toEqual({
        month: '2026-01',
        label: 'Jan',
        tooltipLabel: 'January 2026',
      });
    });
  });

  describe('API Endpoints: /api/v1/admin/kpis', () => {
    beforeEach(async () => {
      adminUser = await User.create({
        name: 'KPI Super Admin',
        email: 'kpi-admin@kredibble.test',
        role: 'admin',
        passwordHash: 'hashed_pw_test',
      });
      adminCookie = `kredibble_admin_token=${signAdminToken(adminUser)}`;

      staffUser = await User.create({
        name: 'KPI Desk Lead',
        email: 'kpi-desk-lead@kredibble.test',
        role: 'admin',
        passwordHash: 'hashed_pw_test',
      });
      await StaffMember.create({
        userId: staffUser._id,
        name: staffUser.name,
        email: staffUser.email,
        roles: ['desk_lead'],
        status: 'active',
      });
      staffToken = signToken(staffUser, { roles: ['desk_lead'] });

      // Seed test data for month 2026-05
      await Opportunity.create({
        title: 'Vetted Opportunity 1',
        description: 'Vetted Opportunity 1 description',
        location: 'Remote',
        company: 'Company 1',
        type: 'job',
        status: 'published',
        vetted: true,
        publishedAt: new Date('2026-05-10T10:00:00.000Z'),
      });
      await Opportunity.create({
        title: 'Vetted Opportunity 2',
        description: 'Vetted Opportunity 2 description',
        location: 'Remote',
        company: 'Company 2',
        type: 'job',
        status: 'published',
        vetted: true,
        publishedAt: new Date('2026-05-12T10:00:00.000Z'),
      });

      await Program.create({
        name: 'Delivered Program 1',
        title: 'Delivered Program 1',
        programType: 'training',
        type: 'training',
        status: 'delivered',
        deliveredAt: new Date('2026-05-15T10:00:00.000Z'),
      });

      await Ambassador.create({
        fullName: 'Active Ambassador 1',
        email: 'amb1@kredibble.test',
        status: 'active',
        joinedAt: '2026-05-01',
      });

      await Partner.create({
        organizationName: 'Closed Partner 1',
        partnerType: 'corporate',
        stage: 'onboard',
        stageHistory: [
          { stage: 'prospect', at: '2026-04-01' },
          { stage: 'onboard', at: '2026-05-05' },
        ],
      });

      await Beneficiary.create({
        fullName: 'Verified Beneficiary 1',
        email: 'ben1@test.com',
        verified: true,
        verifiedAt: '2026-05-14',
      });

      await SocialPost.create({
        platform: 'linkedin',
        title: 'LinkedIn Update 1',
        status: 'published',
        postedAt: new Date('2026-05-20T10:00:00.000Z'),
        reach: 1200,
        engagement: 85,
        url: 'https://linkedin.com/post/1',
      });

      await WebsiteMonth.create({
        month: '2026-05',
        views: 4500,
      });

      await MonthlyReport.create({
        reportMonth: '2026-04',
        generatedAt: new Date('2026-05-02T10:00:00.000Z'),
        view: 'team',
        generatedBy: adminUser._id,
      });

      // Configure explicit targets for 2026-05
      await saveTargetBatch({
        effectiveFrom: '2026-05',
        targets: [
          { kpi: 'opportunities_published', value: 2 },
          { kpi: 'programs_organised', value: 1 },
          { kpi: 'active_ambassadors', value: 1 },
          { kpi: 'partners_onboarded', value: 1 },
          { kpi: 'beneficiaries_verified', value: 1 },
          { kpi: 'posts_published', value: 1 },
          { kpi: 'social_reach', value: 1000 },
          { kpi: 'social_engagement', value: 50 },
          { kpi: 'website_views', value: 4000 },
          { kpi: 'monthly_reports', value: 1 },
        ],
        changedByName: 'Test Admin',
      });
    });

    it('rejects unauthenticated requests to /api/v1/admin/kpis with 401', async () => {
      const res = await request(app).get('/api/v1/admin/kpis');
      expect(res.status).toBe(401);
    });

    it('serves GET /api/v1/admin/kpis with all 10 cards and correct metrics', async () => {
      const res = await request(app)
        .get('/api/v1/admin/kpis?month=2026-05')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.month).toBe('2026-05');
      expect(data.isPast).toBe(true);
      expect(data.kpis).toHaveLength(10);

      const opps = data.kpis.find((k) => k.key === 'opportunities_published');
      expect(opps).toBeDefined();
      expect(opps.value).toBe(2);
      expect(opps.target).toBe(2);
      expect(opps.status).toBe('green');
      expect(opps.statusLabel).toBe('On track');

      const reach = data.kpis.find((k) => k.key === 'social_reach');
      expect(reach.value).toBe(1200);
      expect(reach.target).toBe(1000);
      expect(reach.status).toBe('green');

      const views = data.kpis.find((k) => k.key === 'website_views');
      expect(views.value).toBe(4500);
      expect(views.target).toBe(4000);
    });

    it('serves GET /api/v1/admin/kpis with Bearer token authentication', async () => {
      const res = await request(app)
        .get('/api/v1/admin/kpis?month=2026-05')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.kpis).toHaveLength(10);
    });

    it('serves GET /api/v1/admin/kpis/priorities ranked by attainment', async () => {
      const res = await request(app)
        .get('/api/v1/admin/kpis/priorities?month=2026-05')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.month).toBe('2026-05');
      expect(Array.isArray(data.priorities)).toBe(true);
      expect(data.priorities.length).toBe(10);

      // Verify each priority item has paceAttainment
      for (let i = 0; i < data.priorities.length - 1; i++) {
        expect(data.priorities[i].paceAttainment).toBeLessThanOrEqual(
          data.priorities[i + 1].paceAttainment
        );
      }
    });

    it('respects count parameter on GET /api/v1/admin/kpis/priorities', async () => {
      const res = await request(app)
        .get('/api/v1/admin/kpis/priorities?month=2026-05&count=3')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.priorities).toHaveLength(3);
    });

    it('serves GET /api/v1/admin/kpis/trend with 6-month historical series', async () => {
      const res = await request(app)
        .get('/api/v1/admin/kpis/trend?month=2026-05')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.month).toBe('2026-05');
      expect(data.months).toBe(6);
      expect(data.trend).toBeDefined();

      // Check that trend contains all 10 KPIs
      for (const key of KPI_KEYS) {
        expect(data.trend[key]).toBeDefined();
        expect(data.trend[key]).toHaveLength(6);
        expect(data.trend[key][5].month).toBe('2026-05');
      }
    });

    it('serves single KPI trend when ?kpi= parameter is provided', async () => {
      const res = await request(app)
        .get('/api/v1/admin/kpis/trend?month=2026-05&kpi=opportunities_published')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.kpi).toBe('opportunities_published');
      expect(Array.isArray(data.trend)).toBe(true);
      expect(data.trend).toHaveLength(6);
      expect(data.trend[5].value).toBe(2);
    });

    it('ensures /admin/dashboard and /admin/kpis return identical metrics for the same month', async () => {
      const [kpisRes, dashRes] = await Promise.all([
        request(app).get('/api/v1/admin/kpis?month=2026-05').set('Cookie', adminCookie),
        request(app).get('/api/v1/admin/dashboard?month=2026-05').set('Cookie', adminCookie),
      ]);

      expect(kpisRes.status).toBe(200);
      expect(dashRes.status).toBe(200);

      const kpisData = kpisRes.body.data.kpis;
      const dashData = dashRes.body.data.kpis;

      expect(kpisData.length).toBe(dashData.length);
      for (const card of kpisData) {
        const matchingDash = dashData.find((d) => d.key === card.key);
        expect(matchingDash).toBeDefined();
        expect(matchingDash.value).toBe(card.value);
        expect(matchingDash.target).toBe(card.target);
        expect(matchingDash.status).toBe(card.status);
        expect(matchingDash.statusLabel).toBe(card.statusLabel);
      }

      // Priorities must also match
      const dashPriorities = dashRes.body.data.priorities;
      const kpisPrioritiesRes = await request(app)
        .get('/api/v1/admin/kpis/priorities?month=2026-05')
        .set('Cookie', adminCookie);
      const kpiPriorities = kpisPrioritiesRes.body.data.priorities;

      expect(dashPriorities.map((p) => p.key)).toEqual(kpiPriorities.map((p) => p.key));
    });

    it('ensures scorecards evaluate the exact same metric attainment as the KPI engine', async () => {
      const scorecardRes = await request(app)
        .get('/api/v1/admin/scorecards/me?month=2026-05')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(scorecardRes.status).toBe(200);
      const person = scorecardRes.body.data.people[0];
      expect(person).toBeDefined();

      const kpisRes = await request(app)
        .get('/api/v1/admin/kpis?month=2026-05')
        .set('Cookie', adminCookie);
      const kpis = kpisRes.body.data.kpis;

      // Desk Lead owns all 10 KPIs
      for (const metric of person.metrics) {
        const kpiCard = kpis.find((k) => k.key === metric.key);
        expect(kpiCard).toBeDefined();
        expect(metric.value).toBe(kpiCard.value);
        expect(metric.target).toBe(kpiCard.target);
        expect(metric.status).toBe(kpiCard.status);
        expect(metric.attainment).toBe(kpiCard.paceAttainment);
      }
    });
  });
});
