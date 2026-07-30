/**
 * Webhook adapter — HTTP POST with HMAC-SHA256 signature.
 *
 * The signature is computed over the raw body using the WEBHOOK_SECRET.
 * The receiver can verify authenticity by recomputing the signature.
 *
 * R4: retries are handled by BullMQ's exponential backoff. The adapter
 * itself is stateless and idempotent — calling it twice with the same
 * payload produces the same HTTP request.
 */

import { createHmac } from 'node:crypto';

export interface WebhookPayload {
  url: string;
  secret: string;
  body: Record<string, unknown>;
  correlationId: string;
}

export async function sendWebhook(payload: WebhookPayload): Promise<void> {
  const rawBody = JSON.stringify(payload.body);
  const signature = createHmac('sha256', payload.secret)
    .update(rawBody)
    .digest('hex');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(payload.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Correlation-ID': payload.correlationId,
      },
      body: rawBody,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
