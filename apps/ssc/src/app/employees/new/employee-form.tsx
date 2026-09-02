'use client';

import { useState } from 'react';

interface FormState {
  identityNumber: string;
  fullName: string;
  healthCertificate: string;
  healthExpiry: string;
  branchId: string;
  role: 'employee' | 'freelancer';
  employer?: string;
}

const INITIAL: FormState = {
  identityNumber: '',
  fullName: '',
  healthCertificate: '',
  healthExpiry: '',
  branchId: '',
  role: 'employee',
};

const BRANCHES = [
  { id: 'brn_001', label: 'الفرع الرئيسي — الدمام' },
  { id: 'brn_002', label: 'فرع الرياض' },
  { id: 'brn_003', label: 'فرع جدة' },
];

/** التحقق من الهوية القانونية: 10 أرقام تبدأ بـ 1 أو 2 */
function validateIdentity(value: string): { ok: boolean; hint: string } {
  if (!/^\d+$/.test(value)) return { ok: false, hint: 'يجب أن تكون أرقاماً فقط' };
  if (value.length !== 10) return { ok: false, hint: `يجب أن تكون 10 أرقام (الحالي ${value.length})` };
  if (value[0] !== '1' && value[0] !== '2') return { ok: false, hint: 'يجب أن تبدأ بـ 1 (أحوال) أو 2 (إقامة)' };
  return { ok: true, hint: 'الهوية القانونية صحيحة' };
}

export default function NewEmployeeForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [identityCheck, setIdentityCheck] = useState<{ ok: boolean; hint: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const identity = validateIdentity(form.identityNumber);
  const healthValid = Boolean(form.healthCertificate.trim() && form.healthExpiry);
  const canSubmit =
    identity.ok &&
    form.fullName.trim().length > 2 &&
    healthValid &&
    form.branchId !== '';

  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    if (patch.identityNumber !== undefined) setIdentityCheck(null);
  };

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '2rem' }}>
      <h1>إضافة موظف جديد — RECRUITER 1.5</h1>
      <p className="hint">
        التوظيف السيادي: الهوية القانونية + اليقين الصحي + ربط النطاق الجغرافي (Geofencing).
      </p>

      <section className="card">
        <div className="form-row">
          <label>رقم الإقامة / الأحوال (الهوية القانونية)</label>
          <input
            type="text"
            inputMode="numeric"
            value={form.identityNumber}
            onChange={(e) => set({ identityNumber: e.target.value.replace(/\D/g, '') })}
            onBlur={() => setIdentityCheck(validateIdentity(form.identityNumber))}
            placeholder="مثال: 1012345678 أو 2034567890"
          />
          {identityCheck && (
            <p className={`hint ${identityCheck.ok ? 'ok' : 'bad'}`}>{identityCheck.hint}</p>
          )}
        </div>

        <div className="form-row">
          <label>الاسم الكامل</label>
          <input value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} />
        </div>

        <div className="form-row">
          <label>الشهادة الصحية (اليقين الصحي)</label>
          <input
            value={form.healthCertificate}
            onChange={(e) => set({ healthCertificate: e.target.value })}
            placeholder="رقم الشهادة الصحية"
          />
        </div>

        <div className="form-row">
          <label>تاريخ انتهاء الشهادة الصحية</label>
          <input
            type="date"
            value={form.healthExpiry}
            onChange={(e) => set({ healthExpiry: e.target.value })}
          />
          {healthValid && (
            <p className="hint ok">سُجلت في رادار الامتثال — تنبيه قبل الانتهاء بـ {30} يوماً.</p>
          )}
        </div>

        <div className="form-row">
          <label>الفرع الجغرافي (ربط النطاق — Geofencing)</label>
          <select value={form.branchId} onChange={(e) => set({ branchId: e.target.value })}>
            <option value="">اختر الفرع</option>
            {BRANCHES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <p className="hint">سيُفرض نطاق الحضور الآمن (30–50م) عبر GeoGate على هذا الفرع.</p>
        </div>

        <div className="form-row">
          <label>نوع الحساب</label>
          <select
            value={form.role}
            onChange={(e) => set({ role: e.target.value as FormState['role'] })}
          >
            <option value="employee">موظف تابع</option>
            <option value="freelancer">موظف مستقل</option>
          </select>
        </div>

        <button
          className="btn"
          disabled={!canSubmit}
          onClick={() => canSubmit && setSubmitted(true)}
        >
          تسجيل الموظف
        </button>
      </section>

      {submitted && (
        <section className="card">
          <h2>سُجّل — معاينة (Mock)</h2>
          <p>
            <strong>الهوية:</strong> {form.identityNumber} — <span className="ok">معتمدة</span>
          </p>
          <p>
            <strong>الاسم:</strong> {form.fullName}
          </p>
          <p>
            <strong>الشهادة الصحية:</strong> {form.healthCertificate} تنتهي {form.healthExpiry}
          </p>
          <p>
            <strong>الفرع:</strong> {BRANCHES.find((b) => b.id === form.branchId)?.label}
          </p>
          <p className="hint">
            في الإنتاج: يُرسل عبر <code>/api/v0.1/attendance/check-in</code> و Geofencing للفرع المختار.
          </p>
        </section>
      )}
    </main>
  );
}
