/**
 * RBAC predicates — enforces R3 at the domain layer.
 *
 * Each predicate is a pure function: given an auth context and a target
 * resource, it returns or throws. No HTTP, no database, no side effects.
 *
 * The endpoint→role mapping is the contract's source of truth:
 * Admin manages forms, GDPR, and notifications.
 * Employee may only view/export results.
 * Public users cannot access any authenticated endpoint.
 */

type Role = 'Admin' | 'Employee';

interface AuthContext {
  userId: string;
  role: Role;
  organizationId: string;
}

type Endpoint =
  | 'forms.list'
  | 'forms.create'
  | 'forms.get'
  | 'forms.edit'
  | 'forms.publish'
  | 'results.get'
  | 'results.export'
  | 'gdpr.export'
  | 'gdpr.delete'
  | 'notifications.get'
  | 'notifications.retryEmail'
  | 'notifications.retryWebhook';

const ADMIN_ENDPOINTS: Endpoint[] = [
  'forms.list',
  'forms.create',
  'forms.get',
  'forms.edit',
  'forms.publish',
  'gdpr.export',
  'gdpr.delete',
  'notifications.get',
  'notifications.retryEmail',
  'notifications.retryWebhook',
];

const EMPLOYEE_ENDPOINTS: Endpoint[] = ['results.get', 'results.export'];

/**
 * Check whether an auth context may access an endpoint for a given org.
 * Throws on denial so callers can use `authorize(ctx, ep, org)` without
 * branching — the throw converts to a 401/403 at the HTTP boundary.
 */
export function authorize(
  ctx: AuthContext | null,
  endpoint: Endpoint,
  targetOrgId: string
): void {
  if (!ctx) {
    throw new Error('Unauthenticated');
  }

  if (ctx.organizationId !== targetOrgId) {
    throw new Error('Not authorized');
  }

  if (ADMIN_ENDPOINTS.includes(endpoint)) {
    if (ctx.role !== 'Admin') {
      throw new Error('Not authorized');
    }
    return;
  }

  if (EMPLOYEE_ENDPOINTS.includes(endpoint)) {
    return;
  }

  throw new Error('Not authorized');
}
