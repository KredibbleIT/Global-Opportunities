import { Opportunity } from '../models/Platform.js';
import {
  Program,
  Partner,
  Ambassador,
  Beneficiary,
  SocialPost,
  WebsiteMonth,
  MonthlyReport,
  OpportunityEngagement,
} from '../models/AdminPortal.js';
import { getTargetsForMonth } from './targets.js';
import { getThresholdsInForce } from './thresholds.js';

export const KPI_KEYS = [
  'opportunities_published',
  'programs_organised',
  'active_ambassadors',
  'partners_onboarded',
  'beneficiaries_verified',
  'social_reach',
  'social_engagement',
  'posts_published',
  'website_views',
  'monthly_reports',
];

export const KPI_STATUS_LABELS = {
  green: 'On track',
  amber: 'Behind',
  red: 'Off track',
};

export const KPI_DEFINITIONS = [
  {
    key: 'opportunities_published',
    metric: 'opportunitiesPublished',
    label: 'Opportunities published',
    unit: 'listings',
    unitOne: 'listing',
    owners: ['opportunities_officer', 'desk_lead'],
    kind: 'count',
    note: 'Vetted listings published this month',
    screen: 'opportunities_queue',
  },
  {
    key: 'programs_organised',
    metric: 'programsDelivered',
    label: 'Programs organised',
    unit: 'programs',
    unitOne: 'program',
    owners: ['training_officer', 'desk_lead'],
    kind: 'count',
    note: 'Delivered programs this month',
    screen: 'programs',
  },
  {
    key: 'active_ambassadors',
    metric: 'ambassadorsActive',
    label: 'Active ambassadors',
    unit: 'ambassadors',
    unitOne: 'ambassador',
    owners: ['country_lead', 'desk_lead'],
    kind: 'running_total',
    note: 'Running total: judged against the full target',
    screen: 'network',
  },
  {
    key: 'partners_onboarded',
    metric: 'partnersClosed',
    label: 'Partners onboarded',
    unit: 'partners',
    unitOne: 'partner',
    owners: ['partnerships_officer', 'desk_lead'],
    kind: 'count',
    note: 'Partners that moved to Onboard or Renew (a closed deal) this month',
    screen: 'partners',
  },
  {
    key: 'beneficiaries_verified',
    metric: 'beneficiariesVerified',
    label: 'Beneficiaries verified',
    unit: 'records',
    unitOne: 'record',
    owners: ['database_officer', 'desk_lead'],
    kind: 'count',
    note: 'Database records verified this month',
    screen: 'database',
  },
  {
    key: 'social_reach',
    metric: 'socialReach',
    label: 'Social reach',
    unit: 'people reached',
    unitOne: 'person reached',
    owners: ['social_media_manager', 'desk_lead'],
    kind: 'count',
    note: 'Total reach of posts published this month',
    screen: 'social',
  },
  {
    key: 'social_engagement',
    metric: 'socialEngagement',
    label: 'Social engagement',
    unit: 'interactions',
    unitOne: 'interaction',
    owners: ['social_media_manager', 'desk_lead'],
    kind: 'count',
    note: 'Likes, comments, shares and clicks on posts published this month',
    screen: 'social',
  },
  {
    key: 'posts_published',
    metric: 'postsPublished',
    label: 'Posts published',
    unit: 'posts',
    unitOne: 'post',
    owners: ['social_media_manager', 'desk_lead'],
    kind: 'count',
    note: 'Posts published across all platforms this month',
    screen: 'social',
  },
  {
    key: 'website_views',
    metric: 'websiteViews',
    label: 'Website views',
    unit: 'views',
    unitOne: 'view',
    owners: ['communications_officer', 'desk_lead'],
    kind: 'count',
    note: 'Unique page views on the main site this month',
    screen: 'analytics',
  },
  {
    key: 'monthly_reports',
    metric: 'monthlyReports',
    label: 'Monthly reports',
    unit: 'reports',
    unitOne: 'report',
    owners: ['communications_officer', 'desk_lead'],
    kind: 'count',
    note: 'Reports generated in this calendar month',
    screen: 'reports',
  },
];

const pad = (n) => String(n).padStart(2, '0');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The month of `today` as "YYYY-MM" (UTC). */
export const currentMonth = (today = new Date()) =>
  `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}`;

/** The month `back` months before `month` ("2026-03", 4 -> "2025-11"). */
export function monthsBefore(month, back) {
  const [year, num] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, num - 1 - back, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function daysInMonth(month) {
  const [year, num] = month.split('-').map(Number);
  return new Date(Date.UTC(year, num, 0)).getUTCDate();
}

/** True when `month` is before the month of `today`. Past months are snapshots. */
export const isPastMonth = (month, today = new Date()) => month < currentMonth(today);

/** How far into the month we are: today's day for the current month, whole month for a past one. */
export function monthProgress(month, today = new Date()) {
  const total = daysInMonth(month);
  const isPast = isPastMonth(month, today);
  const cur = currentMonth(today);

  if (isPast) {
    return { dayOfMonth: total, daysInMonth: total };
  }
  if (month === cur) {
    const day = Math.max(1, Math.min(today.getUTCDate(), total));
    return { dayOfMonth: day, daysInMonth: total };
  }
  // Future month
  return { dayOfMonth: 0, daysInMonth: total };
}

/**
 * How far into the month a KPI is judged: monthProgress for "count", whole month for "running_total".
 */
export function kpiMonthProgress(kind, month, today = new Date()) {
  const progress = monthProgress(month, today);
  return kind === 'running_total'
    ? { dayOfMonth: progress.daysInMonth, daysInMonth: progress.daysInMonth }
    : progress;
}

export function formatMonthLabel(month) {
  const [yearStr, monthStr] = month.split('-');
  const monthIdx = parseInt(monthStr, 10) - 1;
  const monthName = MONTH_NAMES[monthIdx] || '';
  return {
    month,
    label: monthName.slice(0, 3),
    tooltipLabel: `${monthName} ${yearStr}`,
  };
}

/**
 * Bounds of a calendar month as Date objects in UTC.
 */
export function monthBounds(month) {
  const value = /^\d{4}-\d{2}$/.test(month || '') ? month : currentMonth();
  const start = new Date(`${value}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { month: value, start, end };
}

/**
 * Pure function: calculates one KPI card result given raw value, target, and thresholds.
 */
export function calculateKpiCard(
  kpiDef,
  rawValue,
  target,
  month,
  today = new Date(),
  thresholds = { greenRatio: 0.95, amberRatio: 0.7 }
) {
  const isPast = isPastMonth(month, today);
  const isRunningTotal = kpiDef.kind === 'running_total';
  const { dayOfMonth, daysInMonth: total } = kpiMonthProgress(kpiDef.kind, month, today);

  const pace = isRunningTotal || isPast ? 1 : dayOfMonth / total;
  const proratedTarget = isRunningTotal || isPast ? target : target * pace;

  // Attainment against full monthly target (raw attainment: 1.2 = 120%)
  const attainment = target > 0 ? rawValue / target : null;

  // Pace attainment (against prorated target: value / proratedTarget)
  let paceAttainment = null;
  if (target > 0) {
    paceAttainment = proratedTarget > 0 ? rawValue / proratedTarget : 0;
  }

  let status = null;
  let statusLabel = null;
  if (target > 0 && paceAttainment !== null) {
    if (paceAttainment >= thresholds.greenRatio) {
      status = 'green';
    } else if (paceAttainment >= thresholds.amberRatio) {
      status = 'amber';
    } else {
      status = 'red';
    }
    statusLabel = KPI_STATUS_LABELS[status];
  }

  return {
    key: kpiDef.key,
    metric: kpiDef.metric,
    label: kpiDef.label,
    unit: kpiDef.unit,
    unitOne: kpiDef.unitOne,
    kind: kpiDef.kind,
    value: rawValue,
    target,
    proratedTarget,
    pace,
    prorated: !isRunningTotal,
    attainment,
    paceAttainment,
    status,
    statusLabel,
    isPast,
    owners: kpiDef.owners,
    screen: kpiDef.screen,
    note: kpiDef.note,
    month,
  };
}

/**
 * Filter to cards with target > 0 and sort ascending by attainment against pro-rated target.
 * Ties preserve definition order in KPI_DEFINITIONS.
 */
export function rankPriorities(cards, count) {
  const indexed = cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.value !== null && (card.target ?? 0) > 0);

  indexed.sort((a, b) => {
    const scoreA = a.card.paceAttainment ?? 0;
    const scoreB = b.card.paceAttainment ?? 0;
    if (scoreA !== scoreB) {
      return scoreA - scoreB;
    }
    return a.index - b.index;
  });

  const ranked = indexed.map(({ card }) => card);
  return typeof count === 'number' && count > 0 ? ranked.slice(0, count) : ranked;
}

/**
 * Network summary calculator for active ambassadors at end of month.
 */
export async function calculateActiveAmbassadorsCount(month) {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const endOfMonth = `${month}-${String(lastDay).padStart(2, '0')}`;

  const allAmbassadors = await Ambassador.find({}).lean();

  const networkAmbassadors = allAmbassadors.filter((a) => {
    const joined = a.joinedAt || (a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : '9999-99-99');
    return joined <= endOfMonth;
  });

  const activeAmbassadors = networkAmbassadors.filter((a) => {
    if (a.status === 'applicant') return false;
    const joined = a.joinedAt || (a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : '9999-99-99');
    if (joined > endOfMonth) return false;
    if (a.status === 'dormant') {
      return Boolean(a.dormantSince && a.dormantSince > endOfMonth);
    }
    if (a.status === 'active') {
      return !a.dormantSince || a.dormantSince > endOfMonth;
    }
    return false;
  });

  return activeAmbassadors.length;
}

/**
 * Fetches the 10 raw KPI metrics from MongoDB for a calendar month.
 */
export async function fetchRawKpiMetrics(month) {
  const { start, end } = monthBounds(month);
  const startDay = start.toISOString().slice(0, 10);
  const endDay = end.toISOString().slice(0, 10);

  const [
    opportunitiesPublished,
    programsDelivered,
    programsActive,
    ambassadorsActive,
    partnersClosed,
    beneficiariesVerified,
    beneficiariesAdded,
    social,
    applications,
    websiteAudienceDoc,
    monthlyReportsCount,
  ] = await Promise.all([
    Opportunity.countDocuments({
      vetted: true,
      $or: [
        { status: 'published' },
        { moderationStatus: { $in: ['published', 'approved'] } },
      ],
      $and: [
        {
          $or: [
            { publishedAt: { $gte: start, $lt: end } },
            { publishedAt: { $exists: false }, createdAt: { $gte: start, $lt: end } },
            { publishedAt: null, createdAt: { $gte: start, $lt: end } },
          ],
        },
      ],
    }),
    Program.countDocuments({
      status: 'delivered',
      $or: [
        { deliveredAt: { $gte: start, $lt: end } },
        { deliveredAt: { $exists: false }, endAt: { $gte: start, $lt: end } },
        { deliveredAt: null, endAt: { $gte: start, $lt: end } },
      ],
    }),
    Program.countDocuments({ status: { $in: ['planned', 'running'] } }),
    calculateActiveAmbassadorsCount(month),
    Partner.countDocuments({
      $or: [
        {
          stageHistory: {
            $elemMatch: {
              stage: { $in: ['onboard', 'renew', 'Onboard', 'Renew'] },
              at: { $gte: startDay, $lt: endDay },
            },
          },
        },
        {
          $and: [
            { stageHistory: { $size: 0 } },
            { closed: true, updatedAt: { $gte: start, $lt: end } },
          ],
        },
      ],
    }),
    Beneficiary.countDocuments({
      verified: true,
      $or: [
        { verifiedAt: { $gte: startDay, $lt: endDay } },
        { verifiedAt: { $exists: false }, createdAt: { $gte: start, $lt: end } },
        { verifiedAt: null, createdAt: { $gte: start, $lt: end } },
      ],
    }),
    Beneficiary.countDocuments({
      $or: [
        { createdAtDate: { $gte: startDay, $lt: endDay } },
        { createdAt: { $gte: start, $lt: end } },
      ],
    }),
    SocialPost.aggregate([
      {
        $match: {
          status: 'published',
          $or: [
            { postedAt: { $gte: start, $lt: end } },
            { postedAtDate: { $gte: startDay, $lt: endDay } },
          ],
        },
      },
      {
        $group: {
          _id: null,
          posts: { $sum: 1 },
          reach: { $sum: '$reach' },
          engagement: { $sum: '$engagement' },
        },
      },
    ]),
    OpportunityEngagement.countDocuments({ event: 'application', createdAt: { $gte: start, $lt: end } }),
    WebsiteMonth.findOne({ month }).lean(),
    MonthlyReport.countDocuments({ generatedAt: { $gte: start, $lt: end } }),
  ]);

  const postsPublished = social[0]?.posts || 0;
  const socialReach = social[0]?.reach || 0;
  const socialEngagement = social[0]?.engagement || 0;
  const websiteViews = websiteAudienceDoc?.views || 0;

  return {
    opportunitiesPublished,
    opportunities_published: opportunitiesPublished,
    programsDelivered,
    programs_organised: programsDelivered,
    programsActive,
    ambassadorsActive,
    active_ambassadors: ambassadorsActive,
    partnersClosed,
    partners_onboarded: partnersClosed,
    beneficiariesVerified,
    beneficiaries_verified: beneficiariesVerified,
    beneficiariesAdded,
    socialReach,
    social_reach: socialReach,
    socialEngagement,
    social_engagement: socialEngagement,
    postsPublished,
    posts_published: postsPublished,
    websiteViews,
    website_views: websiteViews,
    monthlyReports: monthlyReportsCount,
    monthly_reports: monthlyReportsCount,
    opportunityApplications: applications,
  };
}

/**
 * ONE function that returns, for a month:
 * the 10 KPI cards with value, target, prorated target, attainment, status, and pace.
 */
export async function getKpiCardsForMonth(monthQuery, today = new Date()) {
  const month = typeof monthQuery === 'string' && /^\d{4}-\d{2}$/.test(monthQuery)
    ? monthQuery
    : currentMonth(today);

  const [rawValues, targetsList, thresholds] = await Promise.all([
    fetchRawKpiMetrics(month),
    getTargetsForMonth(month),
    getThresholdsInForce(month),
  ]);

  const targetsByMetric = new Map(
    targetsList.map((t) => [t.kpi || t.metric, t.value ?? t.target ?? 0])
  );

  const kpis = KPI_DEFINITIONS.map((def) => {
    const rawVal = rawValues[def.metric] ?? rawValues[def.key] ?? 0;
    const target = targetsByMetric.get(def.key) ?? targetsByMetric.get(def.metric) ?? 0;
    return calculateKpiCard(def, rawVal, target, month, today, thresholds);
  });

  return {
    month,
    isPast: isPastMonth(month, today),
    kpis,
    cards: kpis,
  };
}

/**
 * Returns prioritized KPIs ranked by lowest pro-rated attainment first.
 */
export async function getKpiPrioritiesForMonth(monthQuery, today = new Date(), count) {
  const result = await getKpiCardsForMonth(monthQuery, today);
  const priorities = rankPriorities(result.kpis, count);
  return {
    month: result.month,
    isPast: result.isPast,
    priorities,
  };
}

/**
 * Returns 6-month historical trend of KPIs ending with `month`.
 */
export async function getKpiTrend(monthQuery, monthsCount = 6, kpiKey = null, today = new Date()) {
  const month = typeof monthQuery === 'string' && /^\d{4}-\d{2}$/.test(monthQuery)
    ? monthQuery
    : currentMonth(today);

  const length = Math.max(1, Math.min(36, parseInt(monthsCount, 10) || 6));
  const months = Array.from({ length }, (_, i) => monthsBefore(month, length - 1 - i));

  // Compute monthly figures for all months in parallel
  const monthResults = await Promise.all(
    months.map((m) => getKpiCardsForMonth(m, today))
  );

  // If a specific KPI key was requested:
  if (kpiKey && kpiKey !== 'all') {
    const def = KPI_DEFINITIONS.find((d) => d.key === kpiKey || d.metric === kpiKey);
    const key = def ? def.key : kpiKey;

    const series = monthResults.map((res) => {
      const card = res.kpis.find((c) => c.key === key) || null;
      const formatted = formatMonthLabel(res.month);
      return {
        month: res.month,
        label: formatted.label,
        tooltipLabel: formatted.tooltipLabel,
        value: card ? card.value : 0,
        target: card ? card.target : 0,
        proratedTarget: card ? card.proratedTarget : 0,
        attainment: card ? card.attainment : null,
        paceAttainment: card ? card.paceAttainment : null,
        status: card ? card.status : null,
        statusLabel: card ? card.statusLabel : null,
      };
    });

    return {
      kpi: key,
      month,
      months: length,
      trend: series,
    };
  }

  // All 10 KPIs dictionary
  const trendByKpi = {};
  for (const def of KPI_DEFINITIONS) {
    trendByKpi[def.key] = monthResults.map((res) => {
      const card = res.kpis.find((c) => c.key === def.key) || null;
      const formatted = formatMonthLabel(res.month);
      return {
        month: res.month,
        label: formatted.label,
        tooltipLabel: formatted.tooltipLabel,
        value: card ? card.value : 0,
      };
    });
  }

  return {
    month,
    months: length,
    trend: trendByKpi,
    series: monthResults.map((res) => ({
      month: res.month,
      isPast: res.isPast,
      kpis: res.kpis,
    })),
  };
}
