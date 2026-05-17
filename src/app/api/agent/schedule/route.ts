import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { triggerAgentRun } from '@/lib/agentRunner';

// POST /api/agent/schedule
// Vercel Cron hits this daily at 6am. Secured with CRON_SECRET env var.
// Vercel sends: Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
