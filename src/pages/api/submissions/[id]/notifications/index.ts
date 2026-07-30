import type { APIRoute } from 'astro';
import { getNotificationStatus } from '../../../../../actions/notifications';
import { getSessionUser } from '../../../../../auth/middleware';
import { authorize } from '../../../../../domain/authorization';

export const GET: APIRoute = async ({ params, cookies }) => {
  const correlationId = crypto.randomUUID();
  const submissionId = params.id;

  if (!submissionId) {
    return new Response(JSON.stringify({ error: 'Submission ID required' }), {
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

  try {
    authorize(user, 'notifications.get', user.organizationId);
  } catch {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await getNotificationStatus(submissionId, user.organizationId, correlationId);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
