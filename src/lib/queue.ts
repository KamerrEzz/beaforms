/**
 * BullMQ queue setup for notification dispatch.
 *
 * Two queues: one for email, one for webhooks. Both use the same Redis
 * connection. Workers consume from these queues in the delivery layer.
 *
 * R4: idempotency is enforced by the queue — a job with the same ID is
 * deduplicated by BullMQ automatically.
 */

import { Queue } from 'bullmq';
import { getRedis } from './redis';

function createQueue(name: string): Queue {
  return new Queue(name, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
}

export const emailQueue = createQueue('notifications-email');
export const webhookQueue = createQueue('notifications-webhook');
