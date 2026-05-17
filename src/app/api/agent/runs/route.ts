import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';

// GET /api/agent/runs?source_id=1&limit=5
// Returns recent runs with live status — poll this every 2s during an active run
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden();

  const { searchParams } = new URL(req.url);
  const source_id = searchParams.get('source_id');
  const limit     = parseInt(searchParams.get('limit') || '10');

  const params: any[] = [];
  let where = '';
  if (source_id) { where = 'WHERE ar.source_id = ?'; params.push(source_id); }
  params.push(limit);

  const [runs] = await pool.query(
    `SELECT ar.id, ar.source_id, ar.status, ar.started_at, ar.finished_at,
            ar.events_found, ar.events_extracted, ar.events_skipped_dup,
            ar.events_errored, ar.error_log,
            TIMESTAMPDIFF(SECOND, ar.started_at, IFNULL(ar.finished_at, NOW())) AS elapsed_sec,
            s.name AS source_name
     FROM agent_runs ar
     JOIN sources s ON ar.source_id = s.id
     ${where}
     ORDER BY ar.started_at DESC LIMIT ?`,
    params
  ) as any;

  // Also return count of events added in the most recent completed run
  const hasActive = runs.some((r: any) => r.status === 'running');

  return Response.json({ runs, has_active: hasActive });
}
