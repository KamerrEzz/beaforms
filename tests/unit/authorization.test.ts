import { describe, it, expect } from 'vitest';

/**
 * Authorization (RBAC) — constraint R3
 *
 * Every endpoint must check both `role` and `organizationId`.
 * Admin sees everything in their org; Employee sees only results.
 * Public users cannot access any admin or employee endpoint.
 */

import { authorize } from '../../src/domain/authorization';

// ---------- types (mirrored, not imported) ----------

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
  | 'forms.publish'
  | 'results.get'
  | 'results.export'
  | 'gdpr.export'
  | 'gdpr.delete'
  | 'notifications.get'
  | 'notifications.retryEmail'
  | 'notifications.retryWebhook';

// -----------------------------------------------------------------

describe('Authorization — Admin access', () => {
  const admin = (orgId = 'org-1'): AuthContext => ({
    userId: 'u-1',
    role: 'Admin',
    organizationId: orgId,
  });

  const endpointsNeedingAdmin: Endpoint[] = [
    'forms.list',
    'forms.create',
    'forms.get',
    'forms.publish',
    'gdpr.export',
    'gdpr.delete',
    'notifications.get',
    'notifications.retryEmail',
    'notifications.retryWebhook',
  ];

  it.each(endpointsNeedingAdmin)(
    'allows Admin to access %s within their own org',
    (ep) => {
      expect(() => authorize(admin('org-1'), ep, 'org-1')).not.toThrow();
    }
  );

  it('allows Admin to view results for their org', () => {
    expect(() => authorize(admin(), 'results.get', 'org-1')).not.toThrow();
  });

  it('allows Admin to export results for their org', () => {
    expect(() => authorize(admin(), 'results.export', 'org-1')).not.toThrow();
  });
});

describe('Authorization — Employee access', () => {
  const employee = (orgId = 'org-1'): AuthContext => ({
    userId: 'u-2',
    role: 'Employee',
    organizationId: orgId,
  });

  it('allows Employee to view results within their org', () => {
    expect(() => authorize(employee(), 'results.get', 'org-1')).not.toThrow();
  });

  it('allows Employee to export results within their org', () => {
    expect(() => authorize(employee(), 'results.export', 'org-1')).not.toThrow();
  });

  const forbiddenForEmployee: Endpoint[] = [
    'forms.list',
    'forms.create',
    'forms.get',
    'forms.publish',
    'gdpr.export',
    'gdpr.delete',
    'notifications.get',
    'notifications.retryEmail',
    'notifications.retryWebhook',
  ];

  it.each(forbiddenForEmployee)(
    'rejects Employee accessing %s',
    (ep) => {
      expect(() => authorize(employee(), ep, 'org-1')).toThrow(/not authorized/i);
    }
  );
});

describe('Authorization — Cross-org isolation', () => {
  it('rejects Admin accessing a form belonging to a different organization', () => {
    const admin: AuthContext = {
      userId: 'u-1',
      role: 'Admin',
      organizationId: 'org-1',
    };
    expect(() => authorize(admin, 'forms.get', 'org-2')).toThrow(/not authorized/i);
  });

  it('rejects Employee viewing results from a different organization', () => {
    const emp: AuthContext = {
      userId: 'u-2',
      role: 'Employee',
      organizationId: 'org-1',
    };
    expect(() => authorize(emp, 'results.get', 'org-2')).toThrow(/not authorized/i);
  });
});

describe('Authorization — Unauthenticated access', () => {
  const allEndpoints: Endpoint[] = [
    'forms.list',
    'forms.create',
    'forms.get',
    'forms.publish',
    'results.get',
    'results.export',
    'gdpr.export',
    'gdpr.delete',
    'notifications.get',
    'notifications.retryEmail',
    'notifications.retryWebhook',
  ];

  it.each(allEndpoints)(
    'rejects unauthenticated user on %s',
    (ep) => {
      expect(() => authorize(null, ep, 'org-1')).toThrow(/unauthenticated/i);
    }
  );
});
