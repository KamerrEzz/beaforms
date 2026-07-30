import type { APIRoute } from 'astro';
import { requestDataDeletion } from '../../../actions/gdpr';
import { getSessionUser } from '../../../auth/middleware';
import { authorize } from '../../../domain/authorization';

export const POST: APIRoute = async ({ request, cookies }) => {
  const correlationId = crypto.randomUUID();
  const user = await getSessionUser({ cookies, url: new URL(request.url), locals: {} } as any);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    authorize(user, 'gdpr.delete', user.organizationId);
  } catch {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json();
  const result = await requestDataDeletion(
    { ...body, organizationId: body.organizationId ?? user.organizationId },
    correlationId
  );

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
