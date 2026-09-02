import { describe, expect, it } from 'vitest';
import { enforceAppendOnly, IMMUTABLE_RECORD_ERROR } from '../src/triggers';

describe('C9 Triggers — الحصانة التنفيذية (Append-Only)', () => {
  it('يسمح بالإنشاء (create) فقط', () => {
    const r = enforceAppendOnly({ entityId: '700-1000001234', operation: 'create' });
    expect(r.ok).toBe(true);
  });

  it('يرفض التحديث (update) برمز SOV_950', () => {
    const r = enforceAppendOnly({ entityId: '700-1000001234', operation: 'update', blockIndex: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('SOV_950');
      expect(r.error).toBe('immutable_record');
    }
  });

  it('يرفض الحذف (delete) برمز SOV_950', () => {
    const r = enforceAppendOnly({ entityId: '700-1000001234', operation: 'delete', blockIndex: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('immutable_record');
  });

  it('رمز الخطأ المعتمد في الدستور البرمجي هو SOV_950 بموجب HTTP 409', () => {
    expect(IMMUTABLE_RECORD_ERROR.code).toBe('SOV_950');
    expect(IMMUTABLE_RECORD_ERROR.httpStatus).toBe(409);
  });
});
