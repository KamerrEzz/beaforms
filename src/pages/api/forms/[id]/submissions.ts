import type { APIRoute } from 'astro';
import { submitForm } from '../../../../actions/submissions';

export const POST: APIRoute = async ({ request, params }) => {
  const correlationId = crypto.randomUUID();
  const body = await request.json() as Record<string, unknown>;

  // Inject the formId from the URL path into the body for validation.
  const result = await submitForm({ formId: params.id!, ...body }, correlationId);

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
