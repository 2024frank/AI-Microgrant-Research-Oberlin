import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { getAuthUser, unauthorized } from '@/lib/auth';

/**
 * GET /api/reviewer/dashboard
 * Returns everything a reviewer needs on their landing page:
 * - pending count (their queue)
 * - their recent activity (approvals/rejections today)
 * - personal stats (total approved, rejected, avg time)
 * - sources they're assigned to
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const isAdmin = user.role === 'admin';

  // Source filter — reviewers scoped to their assignments
  const sourceSubquery = isAdmin
    ? ''
    : `AND re.source_id IN (
        SELECT source_id FROM reviewer_sources
        WHERE reviewer_id = (SELECT id FROM users WHERE firebase_uid = ?)
      )`;
  const sourceParams = isAdmin ? [] : [user.uid];

  // Pending count
  const [[{ pending }]] = await pool.query(
    `SELECT COUNT(*) AS pending FROM raw_events re
     WHERE re.status = 'pending' ${sourceSubquery}`,
    sourceParams
  ) as any;

  // Their personal stats
  const [[dbUser]] = await pool.query(
    'SELECT id FROM users WHERE firebase_uid = ?', [user.uid]
  ) as any;
  const userId = dbUser?.id;

  const [[personalStats]] = await pool.query(
    `SELECT
       COUNT(*) AS total_reviewed,
       SUM(action = 'approved') AS total_approved,
       SUM(action = 'rejected') AS total_rejected,
       ROUND(AVG(time_spent_sec), 1) AS avg_time_sec,
       SUM(action = 'approved' AND DATE(created_at) = CURDATE()) AS approved_today,
       SUM(action = 'rejected' AND DATE(created_at) = CURDATE()) AS rejected_today
     FROM review_sessions WHERE reviewer_id = ?`,
    [userId]
  ) as any;

  // Recent activity — last 10 actions
  const [recentActivity] = await pool.query(
    `SELECT rs.action, rs.time_spent_sec, rs.created_at,
            re.title, re.event_type, s.name AS source_name
     FROM review_sessions rs
     JOIN raw_events re ON rs.raw_event_id = re.id
     JOIN sources s ON re.source_id = s.id
     WHERE rs.reviewer_id = ?
     ORDER BY rs.created_at DESC LIMIT 10`,
    [userId]
  ) as any;

  // Sources they cover
  const [assignedSources] = await pool.query(
    isAdmin
      ? `SELECT s.id, s.name, s.slug,
           (SELECT COUNT(*) FROM raw_events WHERE source_id = s.id AND status = 'pending') AS pending_count
         FROM sources s WHERE s.active = 1 ORDER BY s.name`
      : `SELECT s.id, s.name, s.slug,
           (SELECT COUNT(*) FROM raw_events WHERE source_id = s.id AND status = 'pending') AS pending_count
         FROM sources s
         JOIN reviewer_sources rs ON rs.source_id = s.id
         WHERE rs.reviewer_id = ? AND s.active = 1 ORDER BY s.name`,
    isAdmin ? [] : [userId]
  ) as any;

  // Oldest pending event (urgency signal)
  const [[oldestPending]] = await pool.query(
    `SELECT re.title, re.created_at, s.name AS source_name
     FROM raw_events re JOIN sources s ON re.source_id = s.id
     WHERE re.status = 'pending' ${sourceSubquery}
     ORDER BY re.created_at ASC LIMIT 1`,
    sourceParams
  ) as any;

  return Response.json({
    pending,
    personal_stats: personalStats,
    recent_activity: recentActivity,
    assigned_sources: assignedSources,
    oldest_pending: oldestPending || null,
  });
}
