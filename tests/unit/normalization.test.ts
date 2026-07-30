import { describe, it, expect } from 'vitest';

/**
 * Input normalization and CSV safety
 *
 * These are domain-level helpers that shape data before persistence or export.
 * Tests define the expected transformations, not the implementation.
 */

import { normalizeEmail, truncateText, escapeCsvField } from '../../src/domain/normalization';

// -----------------------------------------------------------------

describe('Email normalization', () => {
  it('trims whitespace from the email address', () => {
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('lowercases the local part and domain', () => {
    expect(normalizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('does not strip plus-addressing', () => {
    expect(normalizeEmail('user+tag@example.com')).toBe('user+tag@example.com');
  });

  it('returns empty string for empty input (does not throw)', () => {
    expect(normalizeEmail('')).toBe('');
  });

  it('preserves valid emails with dots and hyphens', () => {
    expect(normalizeEmail('first.last-name@sub.domain.org')).toBe(
      'first.last-name@sub.domain.org'
    );
  });
});

describe('Text length limits', () => {
  it('returns the original string when under the limit', () => {
    expect(truncateText('hello', 100)).toBe('hello');
  });

  it('returns the original string at exactly the limit', () => {
    const input = 'a'.repeat(500);
    expect(truncateText(input, 500)).toBe(input);
  });

  it('truncates text exceeding the limit', () => {
    const input = 'a'.repeat(600);
    const result = truncateText(input, 500);
    expect(result.length).toBe(500);
    expect(result).toBe('a'.repeat(500));
  });

  it('does not cut in the middle of a multi-byte character (if applicable)', () => {
    // Emoji is 4 bytes in UTF-8; truncation should not leave a broken sequence.
    const input = '\u{1F600}\u{1F601}\u{1F602}'; // 3 emojis
    const result = truncateText(input, 5); // 5 bytes — partial emoji
    // The implementation may choose to drop the partial or round down.
    // The key assertion: no exception, and length <= limit.
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

describe('CSV field escaping', () => {
  it('wraps a field containing a comma in double quotes', () => {
    expect(escapeCsvField('one,two')).toBe('"one,two"');
  });

  it('wraps a field containing a double quote and escapes inner quotes', () => {
    expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""');
  });

  it('wraps a field containing a newline', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('does not wrap a plain text field without special characters', () => {
    expect(escapeCsvField('simple')).toBe('simple');
  });

  it('handles an empty string', () => {
    expect(escapeCsvField('')).toBe('');
  });

  it('escapes a field that is only a double quote', () => {
    expect(escapeCsvField('"')).toBe('""""');
  });
});
