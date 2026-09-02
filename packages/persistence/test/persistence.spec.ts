import { describe, expect, it } from 'vitest';
import {
  FIRESTORE_GROUPS,
  tenantGroupPath,
  tenantDocPath,
  c9EventPath,
  staffDocPath,
  hasLiveCredentials,
  createPersistence,
} from '../src/index';

describe('persistence — مجموعات Firestore الأساسية (PH-N1)', () => {
  it('يحدد المجموعات الثماني الحاكمة', () => {
    expect(Object.keys(FIRESTORE_GROUPS)).toEqual([
      'entities',
      'branches',
      'employees',
      'attendance',
      'violations',
      'objections',
      'payroll',
      'c9Ledger',
    ]);
  });

  it('يبني مسارات متداخلة ضمن المستأجر (Fortress 700)', () => {
    expect(tenantGroupPath('T-1', 'attendance')).toBe('tenants/T-1/attendance');
    expect(tenantDocPath('T-1', 'employees', 'u-1')).toBe('tenants/T-1/employees/u-1');
    expect(c9EventPath('T-1', 'e-1')).toBe('tenants/T-1/c9_ledger/e-1');
    expect(staffDocPath('u-1')).toBe('staff/u-1');
  });

  it('يكشف غياب الاعتمادات الحية (تراجع آمن نحو الذاكرة)', () => {
    expect(hasLiveCredentials()).toBe(false);
  });

  it('createPersistence بلا قاعدة حية يعيد null للمخازن (لا يكسر التطوير)', () => {
    const bundle = createPersistence(null, 'T-1');
    expect(bundle.live).toBe(false);
    expect(bundle.c9).toBeNull();
    expect(bundle.attendance).toBeNull();
    expect(bundle.hilap).toBeNull();
  });
});
