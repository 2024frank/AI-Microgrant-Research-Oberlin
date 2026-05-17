import { NextRequest } from 'next/server';
import { GET } from '@/app/api/events/route';
import { adminAuth } from '@/lib/firebase-admin';

const db         = require('@/lib/db');
const mockVerify = adminAuth.verifyIdToken as jest.Mock;

const ADMIN    = { id: 1, email: 'admin@oberlin.edu', role: 'admin',    full_name: 'Admin', active: 1, firebase_uid: 'uid-admin' };
const REVIEWER = { id: 2, email: 'rev@oberlin.edu',   role: 'reviewer', full_name: 'Rev',   active: 1, firebase_uid: 'uid-rev' };

const EVENTS = [
  { id: 1, title: 'Jazz Night',           status: 'pending',  event_type: 'ot' },
  { id: 2, title: 'City Council Meeting', status: 'approved', event_type: 'ot' },
  { id: 3, title: 'Job Opening',          status: 'rejected', event_type: 'jp' },
];

function makeReq(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/events');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { headers: { Authorization: 'Bearer valid' } });
}

beforeEach(() => {
  db.default.query.mockReset();
  mockVerify.mockReset();
  mockVerify.mockResolvedValue({ uid: 'uid-admin', email: 'admin@oberlin.edu' });
});

describe('GET /api/events', () => {
  it('returns all events with pagination', async () => {
    db.default.query
      .mockResolvedValueOnce([[ADMIN]])
      .mockResolvedValueOnce([[{ total: 3 }]])
      .mockResolvedValueOnce([EVENTS]);

    const data = await (await GET(makeReq())).json();
    expect(data.events).toHaveLength(3);
    expect(data.pagination.total).toBe(3);
    expect(data.pagination.has_next).toBe(false);
    expect(data.pagination.has_prev).toBe(false);
  });

  it('filters by status', async () => {
    db.default.query
      .mockResolvedValueOnce([[ADMIN]])
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[EVENTS[1]]]);

    await GET(makeReq({ status: 'approved' }));
    const eventsQuery = db.default.query.mock.calls[2];
    expect(eventsQuery[0]).toContain('re.status = ?');
    expect(eventsQuery[1]).toContain('approved');
  });

  it('filters by source_id', async () => {
    db.default.query
      .mockResolvedValueOnce([[ADMIN]])
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[EVENTS[0]]]);

    await GET(makeReq({ source_id: '1' }));
    expect(db.default.query.mock.calls[2][0]).toContain('re.source_id = ?');
  });

  it('searches title with LIKE', async () => {
    db.default.query
      .mockResolvedValueOnce([[ADMIN]])
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[EVENTS[0]]]);

    await GET(makeReq({ q: 'jazz' }));
    const eventsQuery = db.default.query.mock.calls[2];
    expect(eventsQuery[0]).toContain('LIKE ?');
    expect(eventsQuery[1]).toContain('%jazz%');
  });

  it('caps limit at 100', async () => {
    db.default.query
      .mockResolvedValueOnce([[ADMIN]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await GET(makeReq({ limit: '9999' }));
    const params = db.default.query.mock.calls[2][1];
    expect(params[params.length - 2]).toBe(100);
  });

  it('calculates pagination correctly', async () => {
    db.default.query
      .mockResolvedValueOnce([[ADMIN]])
      .mockResolvedValueOnce([[{ total: 55 }]])
      .mockResolvedValueOnce([EVENTS]);

    const data = await (await GET(makeReq({ limit: '10', page: '2' }))).json();
    expect(data.pagination.pages).toBe(6);
    expect(data.pagination.has_prev).toBe(true);
    expect(data.pagination.has_next).toBe(true);
  });

  it('returns 401 without token', async () => {
    mockVerify.mockRejectedValueOnce(new Error('invalid'));
    expect((await GET(new NextRequest('http://localhost/api/events', {}))).status).toBe(401);
  });

  it('adds reviewer_sources filter for reviewer role', async () => {
    mockVerify.mockResolvedValue({ uid: 'uid-rev', email: 'rev@oberlin.edu' });
    db.default.query
      .mockResolvedValueOnce([[REVIEWER]])
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[EVENTS[0]]]);

    await GET(makeReq());
    // getAuthUser is call[0], count is call[1] — both should include reviewer_sources
    expect(db.default.query.mock.calls).toHaveLength(3);
    expect(db.default.query.mock.calls[1][0]).toContain('reviewer_sources');
  });

  it('echoes filters in response', async () => {
    db.default.query
      .mockResolvedValueOnce([[ADMIN]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const data = await (await GET(makeReq({ status: 'pending', geo_scope: 'city_wide' }))).json();
    expect(data.filters.status).toBe('pending');
    expect(data.filters.geo_scope).toBe('city_wide');
  });
});
