import { NextRequest } from 'next/server';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';
import { triggerAgentRun } from '@/lib/agentRunner';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ source_id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden();
  const { source_id } = await context.params;
  const result = await triggerAgentRun(parseInt(source_id));
  return Response.json(result);
}
