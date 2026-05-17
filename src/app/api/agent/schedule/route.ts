import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { triggerAgentRun } from '@/lib/agentRunner';

// POST /api/agent/schedule
// Called by a cron job (Vercel Cron / external scheduler)
// Secured with a simple CRON_SECRET header
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [sources] = await pool.query(
    'SELECT id, name FROM sources WHERE active = 1'
  ) as any;

  const results = [];
  for (const source of sources) {
    try {
      const result = await triggerAgentRun(source.id);
      results.push({ source: source.name, status: 'ok', inserted: result.inserted });
    } catch (err: any) {
      results.push({ source: source.name, status: 'error', error: err.message });
    }
  }

  return Response.json({ ran: results.length, results });
}
