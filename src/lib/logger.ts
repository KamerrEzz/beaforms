/**
 * Structured JSON logger with correlation ID.
 *
 * Output is a single JSON line per call — parseable by log aggregators.
 * The correlation ID is passed through the request lifecycle so logs from
 * a single submission can be traced end-to-end.
 *
 * Usage:
 *   import { logger, withCorrelationId } from '@/lib/logger';
 *
 *   // In middleware or route handler:
 *   const log = withCorrelationId('req-abc-123');
 *   log.info('Request received', { path: '/api/forms' });
 *
 *   // Or use the global logger (no correlation ID):
 *   logger.info('Server started');
 */

import { AsyncLocalStorage } from 'node:async_hooks';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  correlationId?: string;
  timestamp: string;
  [key: string]: unknown;
}

// AsyncLocalStorage for automatic correlation ID propagation
const correlationStore = new AsyncLocalStorage<string>();

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const correlationId = correlationStore.getStore();
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(correlationId ? { correlationId } : {}),
    ...data,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Logger without explicit correlation ID — uses AsyncLocalStorage if available.
 */
export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
  info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
};

/**
 * Run a function within a correlation ID context.
 * All logger calls inside will automatically include the correlation ID.
 *
 * @example
 *   const result = await withCorrelationId('req-abc-123', async () => {
 *     logger.info('Processing request'); // includes correlationId: "req-abc-123"
 *     await doWork();
 *   });
 */
export async function withCorrelationId<T>(
  correlationId: string,
  fn: () => T | Promise<T>
): Promise<T> {
  return correlationStore.run(correlationId, fn);
}

/**
 * Get the current correlation ID from the async context.
 * Returns undefined if called outside a correlation context.
 */
export function getCorrelationId(): string | undefined {
  return correlationStore.getStore();
}
