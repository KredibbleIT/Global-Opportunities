import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  Program,
  Partner,
  Ambassador,
  Beneficiary,
  SocialPost,
  MonthlyReport,
  TargetChange,
  ThresholdChange,
} from '../src/models/AdminPortal.js';
import { Opportunity } from '../src/models/Platform.js';
import { Notification } from '../src/models/Content.js';
import { Channel, ChannelPost } from '../src/models/Community.js';
import { User, StaffMember, AuditLog } from '../src/models/User.js';
import { parsePagination, paginatedResponse } from '../src/utils/http.js';
import { signAdminToken } from '../src/middleware/auth.js';

describe('BE-019: Performance, Indexes, Pagination, and OpenAPI Specification', () => {
  let adminUser;
  let adminCookie;

  beforeEach(async () => {
    adminUser = await User.create({
      name: 'Performance Admin',
      email: 'perf.admin@kredibble.com',
      role: 'admin',
      emailVerified: true,
      tokenVersion: 0,
    });
    adminCookie = `kredibble_admin_token=${signAdminToken(adminUser)}`;
  });

  describe('Part 1: Schema Index Coverage on Filter & Date Fields', () => {
    const hasIndexOn = (model, fieldsObject) => {
      const indexes = model.schema.indexes();
      return indexes.some(([fields]) => {
        const fieldKeys = Object.keys(fieldsObject);
        const indexKeys = Object.keys(fields);
        if (fieldKeys.length !== indexKeys.length) return false;
        return fieldKeys.every((key) => fields[key] === fieldsObject[key]);
      });
    };

    it('Program and MonthlyReport schemas define date ordering indexes', () => {
      expect(hasIndexOn(Program, { status: 1, deliveredAt: -1 })).toBe(true);
      expect(hasIndexOn(Program, { deliveredAt: -1 })).toBe(true);
      expect(hasIndexOn(MonthlyReport, { generatedAt: -1 })).toBe(true);
    });

    it('Partner schema defines indexes on stage history, stage, and ownership', () => {
      expect(hasIndexOn(Partner, { 'stageHistory.stage': 1, 'stageHistory.at': 1 })).toBe(true);
      expect(hasIndexOn(Partner, { stage: 1, closed: 1 })).toBe(true);
      expect(hasIndexOn(Partner, { assignedOwnerId: 1, closed: 1 })).toBe(true);
    });

    it('Ambassador schema defines indexes on status, joinedAt, and dormantSince', () => {
      expect(hasIndexOn(Ambassador, { status: 1, joinedAt: -1 })).toBe(true);
      expect(hasIndexOn(Ambassador, { joinedAt: -1 })).toBe(true);
      expect(hasIndexOn(Ambassador, { status: 1, dormantSince: 1 })).toBe(true);
      expect(hasIndexOn(Ambassador, { linkedUserId: 1 })).toBe(true);
    });

    it('Beneficiary schema defines indexes on verification, source, and timestamps', () => {
      expect(hasIndexOn(Beneficiary, { ambassadorId: 1, verified: 1, verifiedAt: 1 })).toBe(true);
      expect(hasIndexOn(Beneficiary, { verified: 1, verifiedAt: 1 })).toBe(true);
      expect(hasIndexOn(Beneficiary, { source: 1, verified: 1 })).toBe(true);
      expect(hasIndexOn(Beneficiary, { createdAtDate: -1 })).toBe(true);
      expect(hasIndexOn(Beneficiary, { verifiedAt: -1 })).toBe(true);
    });

    it('SocialPost schema defines indexes on platform, status, and postedAt', () => {
      expect(hasIndexOn(SocialPost, { status: 1, postedAt: -1 })).toBe(true);
      expect(hasIndexOn(SocialPost, { platform: 1, status: 1, postedAt: -1 })).toBe(true);
      expect(hasIndexOn(SocialPost, { postedAtDate: 1, status: 1 })).toBe(true);
    });

    it('Opportunity schema defines compound indexes for vetting and publish status', () => {
      expect(hasIndexOn(Opportunity, { status: 1, publishedAt: -1 })).toBe(true);
      expect(hasIndexOn(Opportunity, { status: 1, vetted: 1, publishedAt: -1 })).toBe(true);
      expect(hasIndexOn(Opportunity, { status: 1, vetted: 1, type: 1, publishedAt: -1 })).toBe(true);
      expect(hasIndexOn(Opportunity, { status: 1, closesAt: 1 })).toBe(true);
    });

    it('Notification schema defines compound indexes for inbox lookup and scheduling', () => {
      expect(hasIndexOn(Notification, { createdAt: -1 })).toBe(true);
      expect(hasIndexOn(Notification, { userId: 1, readAt: 1, createdAt: -1 })).toBe(true);
      expect(hasIndexOn(Notification, { status: 1, scheduledFor: 1 })).toBe(true);
      expect(hasIndexOn(Notification, { audience: 1, status: 1, sentAt: -1 })).toBe(true);
    });

    it('Community Channel & Post schemas define status, visibility, and moderation indexes', () => {
      expect(hasIndexOn(Channel, { status: 1, createdAt: -1 })).toBe(true);
      expect(hasIndexOn(Channel, { visibility: 1, status: 1 })).toBe(true);
      expect(hasIndexOn(ChannelPost, { channelId: 1, createdAt: -1 })).toBe(true);
      expect(hasIndexOn(ChannelPost, { channelId: 1, flagged: 1, createdAt: -1 })).toBe(true);
      expect(hasIndexOn(ChannelPost, { flagged: 1, createdAt: -1 })).toBe(true);
    });

    it('StaffMember and AuditLog define query optimization indexes', () => {
      expect(hasIndexOn(StaffMember, { status: 1, createdAt: -1 })).toBe(true);
      expect(hasIndexOn(StaffMember, { roles: 1, status: 1 })).toBe(true);
      expect(hasIndexOn(AuditLog, { action: 1, createdAt: -1 })).toBe(true);
      expect(hasIndexOn(AuditLog, { resourceType: 1, resourceId: 1, createdAt: -1 })).toBe(true);
    });
  });

  describe('Part 2: Bounded Pagination and Response Shapes', () => {
    it('parsePagination clamps invalid and extreme values (SEC-011 guard)', () => {
      const normal = parsePagination({ page: '2', limit: '25' });
      expect(normal).toEqual({ page: 2, limit: 25, skip: 25 });

      const invalid = parsePagination({ page: '-5', limit: 'abc' });
      expect(invalid).toEqual({ page: 1, limit: 20, skip: 0 });

      const extreme = parsePagination({ page: '1', limit: '5000' });
      expect(extreme.limit).toBe(100);
    });

    it('paginatedResponse produces dual meta and pagination keys for client compatibility', () => {
      const res = paginatedResponse([{ id: '1' }], 45, 2, 20);
      expect(res.data).toEqual([{ id: '1' }]);
      expect(res.meta).toEqual({
        page: 2,
        limit: 20,
        total: 45,
        pages: 3,
      });
      expect(res.pagination).toEqual(res.meta);
    });

    it('managed collections return paginated metadata with real counts', async () => {
      await Program.create([
        { title: 'Prog 1', programType: 'training', status: 'planned' },
        { title: 'Prog 2', programType: 'webinar', status: 'running' },
        { title: 'Prog 3', programType: 'bootcamp', status: 'delivered' },
      ]);

      const res = await request(app)
        .get('/api/v1/admin/programs?page=1&limit=2')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.meta.pages).toBe(2);
      expect(res.body.pagination.total).toBe(3);
    });
  });

  describe('Part 3: Append-Only History Guards', () => {
    it('TargetChange prevents updates and modifications', async () => {
      const change = await TargetChange.create({
        kpi: 'opportunities_published',
        value: 50,
        effectiveFrom: '2026-11',
        seq: 1,
      });

      await expect(
        TargetChange.updateOne({ _id: change._id }, { value: 99 })
      ).rejects.toThrow('TargetChange is append-only and cannot be modified or deleted');
    });

    it('ThresholdChange prevents updates and modifications', async () => {
      const threshold = await ThresholdChange.create({
        green: 90,
        amber: 75,
        effectiveFrom: '2026-11',
        seq: 1,
      });

      await expect(
        ThresholdChange.updateOne({ _id: threshold._id }, { green: 95 })
      ).rejects.toThrow('ThresholdChange is append-only and cannot be modified or deleted');
    });
  });

  describe('Part 4: OpenAPI / Swagger Document Verification', () => {
    it('src/swagger.json exists and is valid OpenAPI 3.0 specification', () => {
      const swaggerPath = path.resolve('src/swagger.json');
      expect(fs.existsSync(swaggerPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(swaggerPath, 'utf8'));
      expect(content.openapi).toBe('3.0.0');
      expect(content.info.title).toBe('Kredibble API');
      expect(content.components.schemas).toBeDefined();
      expect(content.paths).toBeDefined();

      // Check required operational routes
      const paths = Object.keys(content.paths);
      expect(paths).toContain('/admin/kpis');
      expect(paths).toContain('/admin/kpis/priorities');
      expect(paths).toContain('/admin/kpis/trend');
      expect(paths).toContain('/admin/overview/activity');
      expect(paths).toContain('/admin/overview/attention');
      expect(paths).toContain('/admin/scorecards/me');
      expect(paths).toContain('/admin/scorecards/team');
      expect(paths).toContain('/admin/settings/integrations');
      expect(paths).toContain('/admin/settings/account');
      expect(paths).toContain('/admin/settings/password');
      expect(paths).toContain('/admin/staff/invite');
      expect(paths).toContain('/admin/reference-data');
      expect(paths).toContain('/reference-data');
      expect(paths).toContain('/admin/community/channels');
    });
  });
});
