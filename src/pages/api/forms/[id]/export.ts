import type { APIRoute } from 'astro';
import { exportResults } from '../../../actions/results';
import { getSessionUser } from '../../../auth/middleware';
import { authorize } from '../../../domain/authorization';
import { db } from '../../../lib/db';

export const GET: APIRoute = async ({ params, cookies }) => {
  const correlationId = crypto.randomUUID();
  const formId = params.id;

  if (!formId) {
    return new Response(JSON.stringify({ error: 'Form ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = await getSessionUser({ cookies, url: new URL('http://localhost'), locals: {} } as any);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const form = await db.form.findUnique({
    where: { id: formId },
    select: { organizationId: true },
  });

  if (!form) {
    return new Response(JSON.stringify({ error: 'Form not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    authorize(user, 'results.export', form.organizationId);
  } catch {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await exportResults(formId, user.organizationId, correlationId);

  if ('contentType' in result) {
    return new Response(result.body, {
      status: result.status,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="form-${formId}-results.csv"`,
      },
    });
  }

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
