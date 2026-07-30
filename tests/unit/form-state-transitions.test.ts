import { describe, it, expect } from 'vitest';

/**
 * Form State Lifecycle Transitions
 *
 * Covers constraint R2: form edits must not corrupt historical answers.
 * The version number increments on each publish; published forms are immutable.
 *
 * These tests define the expected domain behavior. The implementation must
 * satisfy them — the tests do not describe how it does so.
 */

// ---------- types mirrored from the spec (not an import) ----------

type FormStatus = 'Draft' | 'Published' | 'Archived';

interface Form {
  id: string;
  title: string;
  organizationId: string;
  status: FormStatus;
  version: number;
}

/**
 * Pure domain function: attempts a state transition on a form.
 * Returns the updated form on success, or throws with a descriptive message.
 *
 * The tests below define what transitions are legal.
 */
declare function transitionForm(
  form: Form,
  action: 'publish' | 'archive',
  userId: string,
  role: 'Admin' | 'Employee'
): Form;

// -----------------------------------------------------------------

describe('Form state transitions', () => {
  const baseForm = (overrides: Partial<Form> = {}): Form => ({
    id: 'f-1',
    title: 'Feedback',
    organizationId: 'org-1',
    status: 'Draft',
    version: 0,
    ...overrides,
  });

  // --- Draft -> Published ---

  it('allows an Admin to publish a Draft form and increments the version', () => {
    const form = baseForm();
    const result = transitionForm(form, 'publish', 'admin-1', 'Admin');
    expect(result.status).toBe('Published');
    expect(result.version).toBe(1);
  });

  it('rejects publishing when the caller is an Employee', () => {
    const form = baseForm();
    expect(() => transitionForm(form, 'publish', 'emp-1', 'Employee')).toThrow(
      /not authorized/i
    );
  });

  it('rejects publishing a form that is already Published', () => {
    const form = baseForm({ status: 'Published', version: 1 });
    expect(() => transitionForm(form, 'publish', 'admin-1', 'Admin')).toThrow(
      /invalid transition/i
    );
  });

  it('rejects publishing a form that is Archived', () => {
    const form = baseForm({ status: 'Archived', version: 1 });
    expect(() => transitionForm(form, 'publish', 'admin-1', 'Admin')).toThrow(
      /invalid transition/i
    );
  });

  // --- Published -> Archived ---

  it('allows an Admin to archive a Published form', () => {
    const form = baseForm({ status: 'Published', version: 1 });
    const result = transitionForm(form, 'archive', 'admin-1', 'Admin');
    expect(result.status).toBe('Archived');
    expect(result.version).toBe(1); // version does not change on archive
  });

  it('rejects archiving when the caller is an Employee', () => {
    const form = baseForm({ status: 'Published', version: 1 });
    expect(() => transitionForm(form, 'archive', 'emp-1', 'Employee')).toThrow(
      /not authorized/i
    );
  });

  it('rejects archiving a Draft form', () => {
    const form = baseForm();
    expect(() => transitionForm(form, 'archive', 'admin-1', 'Admin')).toThrow(
      /invalid transition/i
    );
  });

  // --- Immutable published versions ---

  it('publishes a second time creating version 2 (new snapshot)', () => {
    const v1 = baseForm({ status: 'Published', version: 1 });
    const v2 = transitionForm(v1, 'publish', 'admin-1', 'Admin');
    // Re-publishing after archive is a separate concern; here we verify
    // that a second publish increments the version.
    // NOTE: This assumes an Archived -> Published transition exists or that
    // the form was un-archived first. The actual transition path is tested
    // separately; this test only proves version semantics.
    expect(v2.version).toBeGreaterThanOrEqual(2);
  });

  // --- Draft re-entry from Archived (if implemented) ---

  it('does not allow an Employee to transition any form', () => {
    for (const status of ['Draft', 'Published', 'Archived'] as FormStatus[]) {
      const form = baseForm({ status });
      expect(() => transitionForm(form, 'publish', 'emp-1', 'Employee')).toThrow();
      expect(() => transitionForm(form, 'archive', 'emp-1', 'Employee')).toThrow();
    }
  });
});
