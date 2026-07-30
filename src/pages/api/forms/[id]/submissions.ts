import type { APIRoute } from 'astro';
import { submitForm } from '../../../actions/submissions';

export const POST: APIRoute = async ({ request }) => {
  const correlationId = crypto.randomUUID();
  const body = await request.json();

  const result = await submitForm(body, correlationId);

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
