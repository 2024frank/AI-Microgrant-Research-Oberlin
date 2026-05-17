import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { getAuthUser, unauthorized } from '@/lib/auth';

// GET /api/review/queue
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page      = parseInt(searchParams.get('page')      || '0');
  const limit     = parseInt(searchParams.get('limit')     || '20');
  const source_id = searchParams.get('source_id');

  let sourceClause = '';
  const params: any[] = [];

  if (user.role === 'reviewer') {
    sourceClause = `AND re.source_id IN (
      SELECT source_id FROM reviewer_sources WHERE reviewer_id = (
        SELECT id FROM users WHERE firebase_uid = ?
      )
    )`;
    params.push(user.uid);
  }

  if (source_id) {
    sourceClause += ' AND re.source_id = ?';
    params.push(source_id);
  }

  const [events] = await pool.query(
    `SELECT re.id, re.title, re.event_type, re.description, re.sessions,
            re.location_type, re.geo_scope, re.created_at,
            s.name AS source_name, s.slug AS source_slug
     FROM raw_events re
     JOIN sources s ON re.source_id = s.id
     WHERE re.status = 'pending' ${sourceClause}
     ORDER BY re.created_at ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, page * limit]
  ) as any;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM raw_events re
     WHERE re.status = 'pending' ${sourceClause}`,
    params
  ) as any;

  return Response.json({ events, total, page, limit });
}
