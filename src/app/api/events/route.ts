import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { getAuthUser, unauthorized } from '@/lib/auth';

/**
 * GET /api/events
 *
 * Fetch all events with optional filters. Useful for the frontend
 * event log, external integrations, and research exports.
 *
 * Query params:
 *   status      — pending | approved | rejected | resubmitted | all (default: all)
 *   source_id   — filter by source
 *   event_type  — ot | an | jp
 *   geo_scope   — hyper_local | city_wide | county | regional
 *   from        — ISO date string (created_at >=)
 *   to          — ISO date string (created_at <=)
 *   page        — page number, 0-indexed (default: 0)
 *   limit       — results per page, max 100 (default: 50)
 *   order       — asc | desc (default: desc)
 *   q           — search title or description
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);

  const status     = searchParams.get('status')     || 'all';
  const source_id  = searchParams.get('source_id');
  const event_type = searchParams.get('event_type');
  const geo_scope  = searchParams.get('geo_scope');
  const from       = searchParams.get('from');
  const to         = searchParams.get('to');
  const q          = searchParams.get('q');
  const order      = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
  const limit      = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const page       = parseInt(searchParams.get('page') || '0');

  const conditions: string[] = [];
  const params: any[]        = [];

  // Reviewers only see their assigned sources
  if (user.role === 'reviewer') {
    conditions.push(`re.source_id IN (
      SELECT source_id FROM reviewer_sources
      WHERE reviewer_id = (SELECT id FROM users WHERE firebase_uid = ?)
    )`);
    params.push(user.uid);
  }

  if (status !== 'all') {
    conditions.push('re.status = ?');
    params.push(status);
  }
  if (source_id) { conditions.push('re.source_id = ?');   params.push(source_id); }
  if (event_type){ conditions.push('re.event_type = ?');  params.push(event_type); }
  if (geo_scope) { conditions.push('re.geo_scope = ?');   params.push(geo_scope); }
  if (from)      { conditions.push('re.created_at >= ?'); params.push(from); }
  if (to)        { conditions.push('re.created_at <= ?'); params.push(to); }
  if (q) {
    conditions.push('(re.title LIKE ? OR re.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total for pagination
  const countParams = [...params];
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM raw_events re ${where}`,
    countParams
  ) as any;

  // Fetch page
  params.push(limit, page * limit);
  const [events] = await pool.query(
    `SELECT
       re.id,
       re.event_type,
       re.title,
       re.description,
       re.extended_description,
       re.sponsors,
       re.post_type_ids,
       re.sessions,
       re.location_type,
       re.location,
       re.place_name,
       re.room_num,
       re.url_link,
       re.display,
       re.buttons,
       re.contact_email,
       re.phone,
       re.website,
       re.image_cdn_url,
       re.calendar_source_name,
       re.calendar_source_url,
       re.ingested_post_url,
       re.geo_scope,
       re.status,
       re.communityhub_post_id,
       re.created_at,
       re.updated_at,
       s.id   AS source_id,
       s.name AS source_name,
       s.slug AS source_slug,
       ar.started_at AS run_started_at
     FROM raw_events re
     JOIN sources s    ON re.source_id    = s.id
     JOIN agent_runs ar ON re.agent_run_id = ar.id
     ${where}
     ORDER BY re.created_at ${order}
     LIMIT ? OFFSET ?`,
    params
  ) as any;

  return Response.json({
    events,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      has_next: (page + 1) * limit < total,
      has_prev: page > 0,
    },
    filters: { status, source_id, event_type, geo_scope, from, to, q },
  });
}
