import type { APIRoute } from 'astro';
import { getForm, updateForm } from '../../../../actions/forms';
import { getSessionUser } from '../../../../auth/middleware';
import { authorize } from '../../../../domain/authorization';
import { db } from '../../../../lib/db';

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

  // Resolve the form's organization for authorization.
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
    authorize(user, 'forms.get', form.organizationId);
  } catch {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await getForm(formId, user.organizationId, correlationId);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const correlationId = crypto.randomUUID();
  const formId = params.id;

  if (!formId) {
    return new Response(JSON.stringify({ error: 'Form ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = await getSessionUser({ cookies, url: new URL(request.url), locals: {} } as any);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Resolve the form's organization for authorization.
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
    authorize(user, 'forms.edit', form.organizationId);
  } catch {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json();
  const result = await updateForm(formId, body, user.organizationId, correlationId);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
