import { REGULATORY_DEADLINES } from '@lexops/shared';

export const metadata = {
  title: 'الموظفون — قائمة',
};

/** سجلات موظفين تجريبية للعرض (تُستبدل من Firestore في الإنتاج) */
const EMPLOYEES = [
  {
    id: 'emp-001',
    identityNumber: '1012345678',
    name: 'أحمد محمد',
    branch: 'الفرع الرئيسي — الدمام',
    healthExpiry: '2026-09-15',
    probationDay: REGULATORY_DEADLINES.probationMaxDays - 10,
  },
  {
    id: 'emp-002',
    identityNumber: '2034567890',
    name: 'خالد عبدالله',
    branch: 'فرع الرياض',
    healthExpiry: '2026-08-25',
    probationDay: 20,
  },
];

export default function EmployeesPage() {
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '2rem' }}>
      <h1>الموظفون</h1>
      <p className="hint">سجل القوى العاملة — مرتبط برادار الامتثال والي E النطاق الجغرافي.</p>

      <a className="btn" href="/employees/new" style={{ marginBottom: '1.25rem' }}>
        إضافة موظف جديد (RECRUITER 1.5)
      </a>

      <section className="card">
        {EMPLOYEES.map((e) => (
          <div key={e.id} className="task">
            <strong>{e.name}</strong> — {e.identityNumber}
            <div className="hint" style={{ marginTop: '0.25rem' }}>
              {e.branch} · الشهادة الصحية تنتهي {e.healthExpiry} · يوم التجربة {e.probationDay}/
              {REGULATORY_DEADLINES.probationMaxDays}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
