import { NextRequest } from 'next/server';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';
import { triggerAgentRun } from '@/lib/agentRunner';

// POST /api/agent/trigger/:source_id
export async function POST(req: NextRequest, { params }: { params: { source_id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden();

  const sourceId = parseInt(params.source_id);
  const result = await triggerAgentRun(sourceId);
  return Response.json(result);
}
