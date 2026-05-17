import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden();

  const { full_name, role, active, source_ids } = await req.json();
  const sets: string[] = [], vals: any[] = [];

  if (full_name !== undefined)  { sets.push('full_name = ?'); vals.push(full_name); }
  if (role !== undefined)       { sets.push('role = ?');      vals.push(role); }
  if (active !== undefined)     { sets.push('active = ?');    vals.push(active ? 1 : 0); }

  if (sets.length) {
    vals.push(params.id);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);
  }

  if (Array.isArray(source_ids)) {
    await pool.query('DELETE FROM reviewer_sources WHERE reviewer_id = ?', [params.id]);
    if (source_ids.length > 0) {
      const values = source_ids.map((sid: number) => [params.id, sid]);
      await pool.query('INSERT INTO reviewer_sources (reviewer_id, source_id) VALUES ?', [values]);
    }
  }

  const [[updated]] = await pool.query(
    'SELECT id, email, full_name, role, active FROM users WHERE id = ?', [params.id]
  ) as any;
  return Response.json(updated);
}
