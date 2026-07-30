import type { APIRoute } from 'astro';
import { requestDataExport } from '../../../actions/gdpr';
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
    authorize(user, 'gdpr.export', user.organizationId);
  } catch {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json();
  // CRITICAL FIX: Never accept organizationId from user input — derive from session.
  const result = await requestDataExport(
    { userId: body.userId },
    user.organizationId,
    correlationId
  );

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
