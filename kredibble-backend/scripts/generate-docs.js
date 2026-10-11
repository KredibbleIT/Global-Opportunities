import fs from 'fs';
import m2s from 'mongoose-to-swagger';
import Converter from 'openapi-to-postmanv2';

import { User, StaffMember, SavedItem, AuditLog } from '../src/models/User.js';
import { SeekerProfile, HirerAccount } from '../src/models/Profiles.js';
import {
  Opportunity,
  Applicant,
  Event,
  Grant,
  GrantApplication,
  CompanyVerification,
  VerificationDoc,
} from '../src/models/Platform.js';
import { Channel, ChannelPost, Report } from '../src/models/Community.js';
import { Article, Notification } from '../src/models/Content.js';
import {
  Program,
  Partner,
  Ambassador,
  Beneficiary,
  SocialPost,
  MonthlyTarget,
  Testimonial,
  TargetChange,
  ThresholdChange,
  WebsiteMonth,
  MonthlyReport,
  ReferenceDataList,
  IntegrationConfig,
  AmbassadorRequest,
} from '../src/models/AdminPortal.js';

const models = [
  { name: 'User', model: User, path: 'users' },
  { name: 'StaffMember', model: StaffMember, path: 'staff' },
  { name: 'SeekerProfile', model: SeekerProfile, path: 'seekers' },
  { name: 'HirerAccount', model: HirerAccount, path: 'hirers' },
  { name: 'Opportunity', model: Opportunity, path: 'opportunities' },
  { name: 'Applicant', model: Applicant, path: 'applicants' },
  { name: 'Event', model: Event, path: 'events' },
  { name: 'Grant', model: Grant, path: 'grants' },
  { name: 'GrantApplication', model: GrantApplication, path: 'grant-applications' },
  { name: 'CompanyVerification', model: CompanyVerification, path: 'verification/companies' },
  { name: 'VerificationDoc', model: VerificationDoc, path: 'verification/documents' },
  { name: 'Channel', model: Channel, path: 'community/channels' },
  { name: 'ChannelPost', model: ChannelPost, path: 'community/posts' },
  { name: 'Report', model: Report, path: 'reports' },
  { name: 'Article', model: Article, path: 'articles' },
  { name: 'Notification', model: Notification, path: 'notifications' },
  { name: 'SavedItem', model: SavedItem, path: 'saved' },
  { name: 'Program', model: Program, path: 'admin/programs' },
  { name: 'Partner', model: Partner, path: 'admin/partners' },
  { name: 'Ambassador', model: Ambassador, path: 'admin/ambassadors' },
  { name: 'Beneficiary', model: Beneficiary, path: 'admin/beneficiaries' },
  { name: 'SocialPost', model: SocialPost, path: 'admin/social-posts' },
  { name: 'MonthlyTarget', model: MonthlyTarget, path: 'admin/monthly-targets' },
  { name: 'Testimonial', model: Testimonial, path: 'admin/testimonials' },
  { name: 'TargetChange', model: TargetChange, path: 'admin/targets' },
  { name: 'ThresholdChange', model: ThresholdChange, path: 'admin/thresholds' },
  { name: 'WebsiteMonth', model: WebsiteMonth, path: 'admin/website-audience' },
  { name: 'MonthlyReport', model: MonthlyReport, path: 'admin/reports/monthly' },
  { name: 'ReferenceDataList', model: ReferenceDataList, path: 'admin/reference-data' },
  { name: 'IntegrationConfig', model: IntegrationConfig, path: 'admin/settings/integrations' },
  { name: 'AmbassadorRequest', model: AmbassadorRequest, path: 'admin/ambassador-requests' },
  { name: 'AuditLog', model: AuditLog, path: 'admin/audit-logs' },
];

function sanitizeSchema(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeSchema);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'type' && value === 'schemaobjectid') {
      result.type = 'string';
      result.format = 'objectId';
    } else {
      result[key] = sanitizeSchema(value);
    }
  }
  return result;
}

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Kredibble API',
    version: '1.0.0',
    description: 'Auto-generated API documentation for Kredibble backend',
  },
  servers: [{ url: 'http://localhost:4000/api' }],
  components: {
    schemas: {},
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {},
};

for (const { name, model, path } of models) {
  const schema = sanitizeSchema(m2s(model));
  swaggerSpec.components.schemas[name] = schema;

  // Add standard REST endpoints for models
  swaggerSpec.paths[`/${path}`] = {
    get: {
      summary: `List ${name}s`,
      tags: [name],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'q', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        200: {
          description: 'A paginated list of records',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { $ref: `#/components/schemas/${name}` } },
                  meta: {
                    type: 'object',
                    properties: {
                      page: { type: 'integer' },
                      limit: { type: 'integer' },
                      total: { type: 'integer' },
                      pages: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    post: {
      summary: `Create a ${name}`,
      tags: [name],
      requestBody: {
        content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
      },
      responses: {
        201: { description: 'Created' },
      },
    },
  };

  swaggerSpec.paths[`/${path}/{id}`] = {
    get: {
      summary: `Get a ${name}`,
      tags: [name],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Record found' } },
    },
    patch: {
      summary: `Update a ${name}`,
      tags: [name],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
      },
      responses: { 200: { description: 'Updated' } },
    },
    delete: {
      summary: `Delete a ${name}`,
      tags: [name],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' } },
    },
  };
}

// Dedicated Admin & KPI Routes
swaggerSpec.paths['/admin/kpis'] = {
  get: {
    summary: 'Get monthly KPI cards and attainments',
    tags: ['Admin KPIs'],
    parameters: [{ name: 'month', in: 'query', schema: { type: 'string', example: '2026-10' } }],
    responses: {
      200: {
        description: 'KPI attainment summary',
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    },
  },
};

swaggerSpec.paths['/admin/kpis/priorities'] = {
  get: {
    summary: 'Get prioritized KPIs ranked by attainment ascending',
    tags: ['Admin KPIs'],
    parameters: [
      { name: 'month', in: 'query', schema: { type: 'string', example: '2026-10' } },
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 3 } },
    ],
    responses: { 200: { description: 'Prioritized KPIs list' } },
  },
};

swaggerSpec.paths['/admin/kpis/trend'] = {
  get: {
    summary: 'Get 6-month historical trend series for a KPI',
    tags: ['Admin KPIs'],
    parameters: [
      { name: 'metric', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'month', in: 'query', schema: { type: 'string', example: '2026-10' } },
    ],
    responses: { 200: { description: 'Trend series' } },
  },
};

swaggerSpec.paths['/admin/overview/activity'] = {
  get: {
    summary: 'Get bounded mixed activity feed across operational entities',
    tags: ['Admin Overview'],
    parameters: [
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
      { name: 'month', in: 'query', schema: { type: 'string' } },
    ],
    responses: { 200: { description: 'Recent activity feed items' } },
  },
};

swaggerSpec.paths['/admin/overview/attention'] = {
  get: {
    summary: 'Get counts of items needing staff attention',
    tags: ['Admin Overview'],
    responses: { 200: { description: 'Attention counters' } },
  },
};

swaggerSpec.paths['/admin/scorecards/me'] = {
  get: {
    summary: 'Get personal scorecard for caller with historical trend',
    tags: ['Admin Scorecards'],
    parameters: [{ name: 'month', in: 'query', schema: { type: 'string', example: '2026-10' } }],
    responses: { 200: { description: 'Personal scorecard' } },
  },
};

swaggerSpec.paths['/admin/scorecards/team'] = {
  get: {
    summary: 'Get team-wide scorecards (Desk Lead & Super Admin)',
    tags: ['Admin Scorecards'],
    parameters: [{ name: 'month', in: 'query', schema: { type: 'string', example: '2026-10' } }],
    responses: { 200: { description: 'Team scorecards' } },
  },
};

swaggerSpec.paths['/admin/settings/integrations/{kind}/test'] = {
  post: {
    summary: 'Test connectivity for a third-party integration probe',
    tags: ['Admin Settings'],
    parameters: [{ name: 'kind', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: {
      content: { 'application/json': { schema: { type: 'object' } } },
    },
    responses: { 200: { description: 'Probe result' } },
  },
};

swaggerSpec.paths['/admin/settings/account'] = {
  get: {
    summary: 'Get caller account profile and notification preferences',
    tags: ['Admin Settings'],
    responses: { 200: { description: 'Caller profile' } },
  },
  put: {
    summary: 'Update caller account profile and notification preferences',
    tags: ['Admin Settings'],
    requestBody: {
      content: { 'application/json': { schema: { type: 'object' } } },
    },
    responses: { 200: { description: 'Updated profile' } },
  },
};

swaggerSpec.paths['/admin/settings/password'] = {
  post: {
    summary: 'Change password with re-authentication and tokenVersion increment',
    tags: ['Admin Settings'],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['currentPassword', 'newPassword'],
            properties: {
              currentPassword: { type: 'string' },
              newPassword: { type: 'string', minLength: 8 },
            },
          },
        },
      },
    },
    responses: { 200: { description: 'Password changed successfully' } },
  },
};

swaggerSpec.paths['/admin/staff/invite'] = {
  post: {
    summary: 'Invite staff member with up to 2 roles and auto-provision User',
    tags: ['Admin Staff'],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'roles'],
            properties: {
              email: { type: 'string', format: 'email' },
              name: { type: 'string' },
              roles: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 },
            },
          },
        },
      },
    },
    responses: { 201: { description: 'Staff invited successfully' } },
  },
};

swaggerSpec.paths['/admin/reference-data/{group}/{key}'] = {
  get: {
    summary: 'Get reference data list items for a specific group and key',
    tags: ['Reference Data'],
    parameters: [
      { name: 'group', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'key', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'q', in: 'query', schema: { type: 'string' } },
      { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
    ],
    responses: { 200: { description: 'Reference data items' } },
  },
  put: {
    summary: 'Update reference data list items',
    tags: ['Reference Data'],
    parameters: [
      { name: 'group', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'key', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['items'],
            properties: {
              items: { type: 'array', items: { type: 'string' } },
              label: { type: 'string' },
            },
          },
        },
      },
    },
    responses: { 200: { description: 'Updated reference data list' } },
  },
};

swaggerSpec.paths['/reference-data'] = {
  get: {
    summary: 'Public list of all reference data groups and lists',
    tags: ['Reference Data'],
    responses: { 200: { description: 'All reference data groups' } },
  },
};

swaggerSpec.paths['/reference-data/{group}/{key}'] = {
  get: {
    summary: 'Public reference data list items for dropdowns and forms',
    tags: ['Reference Data'],
    parameters: [
      { name: 'group', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'key', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: { 200: { description: 'Reference data items' } },
  },
};

// BE-021: website category taxonomy + live tally
swaggerSpec.paths['/admin/sync/taxonomy'] = {
  get: {
    summary: 'List website-to-app category mappings',
    tags: ['Website Sync'],
    responses: { 200: { description: 'Category mapping table' } },
  },
  put: {
    summary: 'Create or update a website category mapping',
    tags: ['Website Sync'],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['websiteCategory'],
            properties: {
              websiteCategory: { type: 'string' },
              appCategory: { type: 'string', nullable: true },
              note: { type: 'string' },
            },
          },
        },
      },
    },
    responses: { 200: { description: 'Mapping saved' } },
  },
};

swaggerSpec.paths['/admin/sync/tally'] = {
  get: {
    summary: 'Compare website opportunities and categories with the app',
    tags: ['Website Sync'],
    responses: {
      200: { description: 'Tally report (in both, only website, only app, differing, unmapped)' },
      502: { description: 'Website unreachable or unconfigured' },
    },
  },
};

swaggerSpec.paths['/admin/community/channels'] = {
  get: {
    summary: 'List community channels with moderation status',
    tags: ['Community Moderation'],
    parameters: [
      { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'flagged', 'removed'] } },
      { name: 'q', in: 'query', schema: { type: 'string' } },
      { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
    ],
    responses: { 200: { description: 'Channels list' } },
  },
  post: {
    summary: 'Create a community channel',
    tags: ['Community Moderation'],
    requestBody: {
      content: { 'application/json': { schema: { type: 'object' } } },
    },
    responses: { 201: { description: 'Channel created' } },
  },
};

swaggerSpec.paths['/admin/community/channels/{id}'] = {
  get: {
    summary: 'Get channel detail with moderation status',
    tags: ['Community Moderation'],
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: { 200: { description: 'Channel detail' } },
  },
  patch: {
    summary: 'Moderate channel status (active, flagged, removed)',
    tags: ['Community Moderation'],
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: {
      content: { 'application/json': { schema: { type: 'object' } } },
    },
    responses: { 200: { description: 'Channel updated' } },
  },
  delete: {
    summary: 'Remove channel',
    tags: ['Community Moderation'],
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: { 200: { description: 'Channel removed' } },
  },
};

swaggerSpec.paths['/admin/community/channels/{channelId}/posts/{postId}'] = {
  delete: {
    summary: 'Remove post and atomically decrement channel postsCount',
    tags: ['Community Moderation'],
    parameters: [
      { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'postId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: { 200: { description: 'Post removed' } },
  },
};

swaggerSpec.paths['/admin/community/posts/{id}'] = {
  patch: {
    summary: 'Flag offending post with moderation reason',
    tags: ['Community Moderation'],
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              flagged: { type: 'boolean' },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
    responses: { 200: { description: 'Post flagged' } },
  },
  delete: {
    summary: 'Delete offending post',
    tags: ['Community Moderation'],
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: { 200: { description: 'Post deleted' } },
  },
};

fs.writeFileSync('src/swagger.json', JSON.stringify(swaggerSpec, null, 2));
console.log('Generated src/swagger.json');

Converter.convert({ type: 'json', data: swaggerSpec }, {}, (err, conversionResult) => {
  if (err) {
    console.error(err);
  } else if (!conversionResult.result) {
    console.error('Could not convert', conversionResult.reason);
  } else {
    fs.writeFileSync('kredibble-postman-collection.json', JSON.stringify(conversionResult.output[0].data, null, 2));
    console.log('Generated kredibble-postman-collection.json');
  }
});
