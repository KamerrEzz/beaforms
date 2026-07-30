/**
 * Data normalization and CSV safety helpers.
 *
 * These run before persistence (email) or export (CSV). They must not
 * throw on edge cases — empty strings and malformed data are valid inputs.
 */

/**
 * Trim whitespace and lowercase the entire email address. Does not strip
 * plus-addressing or validate format — that is the caller's job.
 */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Truncate a string to `maxLen` bytes without leaving a broken UTF-8 sequence.
 *
 * The naive `.slice(0, maxLen)` can split a multi-byte character (e.g. emoji).
 * This implementation walks backward from the cut point to skip any continuation
 * bytes (those starting with 0b10xxxxxx), so the output is always valid UTF-8.
 */
export function truncateText(input: string, maxLen: number): string {
  if (input.length <= maxLen) return input;

  const encoded = new TextEncoder().encode(input);
  if (encoded.length <= maxLen) return input;

  // Walk backward from the cut to skip partial multi-byte sequences.
  let end = maxLen;
  while (end > 0 && (encoded[end] & 0xc0) === 0x80) {
    end--;
  }

  return new TextDecoder().decode(encoded.slice(0, end));
}

/**
 * Escape a string for safe inclusion in a CSV field (RFC 4180).
 * Wraps in double quotes if the field contains a comma, quote, or newline.
 * Inner double quotes are escaped by doubling them.
 */
export function escapeCsvField(value: string): string {
  if (value === '') return '';

  const needsQuoting = value.includes(',') || value.includes('"') || value.includes('\n');
  if (!needsQuoting) return value;

  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}
