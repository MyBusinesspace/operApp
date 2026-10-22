import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getNextSequenceBatch } from '../../shared/sequence.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { sequence_type, count, prefix, padding } = await req.json();
    if (!sequence_type) return Response.json({ error: 'sequence_type is required' }, { status: 400 });
    if (!count || count < 1) return Response.json({ error: 'count must be >= 1' }, { status: 400 });
    if (count > 5000) return Response.json({ error: 'count must be <= 5000' }, { status: 400 });

    const numbers = await getNextSequenceBatch(base44, sequence_type, count, { prefix, padding });
    return Response.json({ numbers });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}