import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { getAuthUser, unauthorized } from '@/lib/auth';

// GET /api/review/events/:id
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const [[event]] = await pool.query(
    `SELECT re.*, s.name AS source_name, s.calendar_source_name
     FROM raw_events re JOIN sources s ON re.source_id = s.id
     WHERE re.id = ?`,
    [params.id]
  ) as any;

  if (!event) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(event);
}
