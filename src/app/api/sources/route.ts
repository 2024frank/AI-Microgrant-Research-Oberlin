import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';
import { triggerAgentRun } from '@/lib/agentRunner';

// GET /api/sources
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const [rows] = await pool.query(
    `SELECT s.*,
       (SELECT COUNT(*) FROM raw_events WHERE source_id = s.id)                    AS total_events,
       (SELECT SUM(status='approved') FROM raw_events WHERE source_id = s.id)      AS total_approved,
       (SELECT MAX(finished_at) FROM agent_runs WHERE source_id = s.id)            AS last_run_at,
       (SELECT status FROM agent_runs WHERE source_id = s.id ORDER BY started_at DESC LIMIT 1) AS last_run_status
     FROM sources s ORDER BY s.name ASC`
  ) as any;

  return Response.json(rows);
}

// POST /api/sources
// Body: { name, agent_id }  — that's it. Everything else comes from shared env vars.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden();

  const { name, agent_id } = await req.json();

  if (!name || !agent_id) {
    return Response.json({ error: 'name and agent_id are required' }, { status: 400 });
  }

  // Auto-generate slug from name
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Check slug uniqueness
  const [[existing]] = await pool.query(
    'SELECT id FROM sources WHERE slug = ?', [slug]
  ) as any;
  if (existing) {
    return Response.json({ error: `A source named "${name}" already exists` }, { status: 409 });
  }

  // All agents share the same environment/vault from env vars
  const agentConfig = {
    agent_id,
    environment_id: process.env.SOURCE_BUILDER_ENVIRONMENT_ID,
    vault_id:       process.env.SOURCE_BUILDER_VAULT_ID,
  };

  const [result] = await pool.query(
    `INSERT INTO sources
       (name, slug, agent_id, agent_config, calendar_source_name, active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [name, slug, agent_id, JSON.stringify(agentConfig), name]
  ) as any;

  const [[created]] = await pool.query(
    'SELECT * FROM sources WHERE id = ?', [result.insertId]
  ) as any;

  return Response.json(created, { status: 201 });
}
