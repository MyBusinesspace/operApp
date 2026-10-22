import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getNextSequence } from '../../shared/sequence.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { sequence_type, prefix, padding } = await req.json();
    if (!sequence_type) return Response.json({ error: 'sequence_type is required' }, { status: 400 });

    const number = await getNextSequence(base44, sequence_type, { prefix, padding });
    return Response.json({ number });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}