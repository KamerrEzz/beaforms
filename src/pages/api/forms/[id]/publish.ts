import type { APIRoute } from 'astro';
import { publishForm } from '../../../../actions/forms';
import { getSessionUser } from '../../../../auth/middleware';
import { authorize } from '../../../../domain/authorization';
import { db } from '../../../../lib/db';

export const POST: APIRoute = async ({ params, cookies }) => {
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
    authorize(user, 'forms.publish', form.organizationId);
  } catch {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await publishForm(formId, user.userId, user.role, user.organizationId, correlationId);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
