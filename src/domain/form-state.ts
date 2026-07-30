/**
 * Form state machine — enforces R2 (immutable versions).
 *
 * Draft → Published → Archived. Published forms carry a version number that
 * never changes after the fact. A new publish on the same form creates a new
 * version snapshot.
 *
 * The illegal transitions (Published → Draft, Archived → Draft) are omitted
 * intentionally: once a form goes live, reverting it to draft would break
 * existing submissions.
 */

type FormStatus = 'Draft' | 'Published' | 'Archived';

interface Form {
  id: string;
  title: string;
  organizationId: string;
  status: FormStatus;
  version: number;
}

const VALID_TRANSITIONS: Record<string, FormStatus[]> = {
  Draft: ['Published'],
  Published: ['Archived', 'Published'],
  Archived: ['Published'],
};

/**
 * Attempt a state transition on a form. Returns the updated form on success,
 * or throws with a descriptive message on failure.
 */
export function transitionForm(
  form: Form,
  action: 'publish' | 'archive',
  _userId: string,
  role: 'Admin' | 'Employee'
): Form {
  if (role !== 'Admin') {
    throw new Error('Not authorized');
  }

  const targets = VALID_TRANSITIONS[form.status];
  if (!targets) {
    throw new Error('Invalid transition');
  }

  if (action === 'publish') {
    if (!targets.includes('Published')) {
      throw new Error('Invalid transition');
    }
    return { ...form, status: 'Published', version: form.version + 1 };
  }

  if (action === 'archive') {
    if (!targets.includes('Archived')) {
      throw new Error('Invalid transition');
    }
    return { ...form, status: 'Archived' };
  }

  throw new Error('Invalid transition');
}
