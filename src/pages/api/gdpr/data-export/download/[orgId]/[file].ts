import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { getSessionUser } from '../../../../../../auth/middleware';
import { authorize } from '../../../../../../domain/authorization';
import { logger } from '../../../../../../lib/logger';

export const GET: APIRoute = async ({ params, cookies }) => {
  const correlationId = crypto.randomUUID();
  const { orgId, file } = params;

  if (!orgId || !file) {
    return new Response(JSON.stringify({ error: 'Missing parameters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Basic path traversal protection.
  if (file.includes('..') || file.includes('/') || file.includes('\\')) {
    return new Response(JSON.stringify({ error: 'Invalid file name' }), {
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
    authorize(user, 'gdpr.export', orgId);
  } catch {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const filePath = path.join(process.cwd(), 'data', 'exports', orgId, file);

  if (!fs.existsSync(filePath)) {
    logger.warn('Export file not found', { correlationId, filePath });
    return new Response(JSON.stringify({ error: 'Export not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${file}"`,
    },
  });
};
