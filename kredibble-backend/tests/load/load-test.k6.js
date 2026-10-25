import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Target: staging API (set via --env or K6_STAGING_URL)
export const options = {
  stages: [
    { duration: '30s', target: 100 },   // ramp up
    { duration: '1m', target: 500 },    // ramp to 500 concurrent
    { duration: '2m', target: 500 },    // hold at 500
    { duration: '1m', target: 1000 },   // ramp to 1000 concurrent
    { duration: '2m', target: 1000 },   // hold at 1000 (pre-launch target)
    { duration: '30s', target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(99)<500'],   // pre-launch p99 < 500ms
    errors: ['rate<0.01'],              // <1% error rate
  },
};

const BASE_URL = __ENV.STAGING_URL || 'https://staging-api.globalopportunitydesk.com';

export default function () {
  // 1. Health check (public, no auth)
  let res = http.get(`${BASE_URL}/api/v1/health`);
  check(res, {
    'health status is 200': (r) => r.status === 200,
    'health body ok': (r) => r.body.includes('"status":"ok"'),
  }) || errorRate.add(1);

  sleep(0.5);

  // 2. Public read: opportunities list
  res = http.get(`${BASE_URL}/api/v1/opportunities?limit=20`);
  check(res, {
    'opportunities status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);

  // 3. Public read: events list
  res = http.get(`${BASE_URL}/api/v1/events?limit=20`);
  check(res, {
    'events status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);

  // 4. Public read: articles list
  res = http.get(`${BASE_URL}/api/v1/articles?limit=20`);
  check(res, {
    'articles status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1.5);
}
