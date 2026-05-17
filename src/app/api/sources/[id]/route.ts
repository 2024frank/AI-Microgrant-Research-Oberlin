import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';

// PATCH /api/sources/:id
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden();

  const body = await req.json();
  const allowed = ['name', 'agent_id', 'schedule_cron', 'active'];
  const updates: Record<string, any> = {};

  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k];
  }

  // If agent_id changed, update agent_config too
  if (body.agent_id) {
    updates.agent_config = JSON.stringify({
      agent_id:       body.agent_id,
      environment_id: process.env.SOURCE_BUILDER_ENVIRONMENT_ID,
      vault_id:       process.env.SOURCE_BUILDER_VAULT_ID,
    });
  }

  if (!Object.keys(updates).length) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  await pool.query(
    `UPDATE sources SET ${setClauses} WHERE id = ?`,
    [...Object.values(updates), params.id]
  );

  const [[updated]] = await pool.query('SELECT * FROM sources WHERE id = ?', [params.id]) as any;
  return Response.json(updated);
}

// DELETE /api/sources/:id  — soft delete
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden();

  await pool.query('UPDATE sources SET active = 0 WHERE id = ?', [params.id]);
  return Response.json({ ok: true });
}
